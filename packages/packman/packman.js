//
// Package Manager
//

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { ArchiveReader, libarchiveWasm } = require('libarchive-wasm');

const Downloader = require('./downloader');

const PLATFORM_IDS = {
    darwin: 'mac',
    linux: 'linux',
    win32: 'win',
};

const MANIFEST_FILE = "packages.json";
const TEMP_FOLDER = "_temp_pack"
const GITHUB_URL_PREFIX = "https://github.com/";
const GITHUB_URL_SUFFIX = "raw/refs/heads/main/";
const GENERIC_GROUP = "generic";

function resolveUrl(baseUrl, filename) {
    let normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    if (baseUrl.startsWith(GITHUB_URL_PREFIX)) {
        normalizedBaseUrl += GITHUB_URL_SUFFIX;
    }

    return new URL(filename, normalizedBaseUrl).toString();
}

function dirExists(dirname) {
    return fs.existsSync(dirname) && fs.statSync(dirname).isDirectory();
}

function fileExists(filename) {
    return fs.existsSync(filename) && fs.statSync(filename).isFile();
}

function findImplicitArchiveRoot(reader) {
    const entries = [];
    const parents = new Set();
    for (const entry of reader.entries()) {
        const name = path.posix.normalize(entry.getPathname().replace(/\\/g, '/')).replace(/\/+$/, '');
        if (!name || name === '.') continue;
        const parts = name.split('/');
        for (let i = 1; i < parts.length; i++) {
            parents.add(parts.slice(0, i).join('/'));
        }
        entries.push({ name, parts, directory: entry.getFiletype() === 'Directory' });
    }

    let common = null;
    for (const entry of entries) {
        if (entry.directory && parents.has(entry.name)) continue;
        const directories = entry.directory ? entry.parts : entry.parts.slice(0, -1);
        if (common == null) common = directories;
        else {
            let i = 0;
            while (i < common.length && i < directories.length && common[i] === directories[i]) i++;
            common = common.slice(0, i);
        }
        if (common.length === 0) return null;
    }
    return common?.length ? common.join('/') : null;
}

function parseTarMode(line) {
    const flags = line.slice(0, 10);
    if (!/^[bcdhlps-][r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-]$/.test(flags)) {
        throw new Error('invalid tar permission listing');
    }
    let mode = 0;
    for (const [index, bit] of [[1, 0o400], [2, 0o200], [3, 0o100],
        [4, 0o040], [5, 0o020], [6, 0o010], [7, 0o004], [8, 0o002], [9, 0o001]]) {
        if (/[rwxst]/.test(flags[index])) mode |= bit;
    }
    if (/[sS]/.test(flags[3])) mode |= 0o4000;
    if (/[sS]/.test(flags[6])) mode |= 0o2000;
    if (/[tT]/.test(flags[9])) mode |= 0o1000;
    return { type: flags[0], mode };
}

function readTarModes(archivePath) {
    return new Promise((resolve, reject) => {
        const child = spawn('tar', ['-tvf', archivePath], { stdio: ['ignore', 'pipe', 'pipe'] });
        const modes = [];
        let pending = '';
        let error = null;
        let stderr = '';
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', chunk => {
            pending += chunk;
            let end;
            while ((end = pending.indexOf('\n')) !== -1) {
                const line = pending.slice(0, end);
                pending = pending.slice(end + 1);
                if (!error) {
                    try { modes.push(parseTarMode(line)); }
                    catch (err) { error = err; }
                }
            }
        });
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4096); });
        child.on('error', reject);
        child.on('close', code => {
            if (error) reject(error);
            else if (code !== 0 || pending) reject(new Error(`failed to read tar permissions: ${stderr.trim()}`));
            else resolve(modes);
        });
    });
}

async function extractArchive(archivePath, targetDir, root=null, assetName=null) {
    const extractionRoot = path.resolve(targetDir);
    const assetDirectory = path.resolve(extractionRoot, assetName);
    let archiveRoot = null;
    if (root != null) {
        if (typeof root !== 'string' || root.includes('\\')) {
            throw new Error('invalid archive root');
        }
        if (root !== '') {
            archiveRoot = path.posix.normalize(root.replace(/\/$/, ''));
            if (archiveRoot === '.' || archiveRoot === '..' || archiveRoot.startsWith('../') ||
                path.posix.isAbsolute(root) || /^[A-Za-z]:/.test(root)) {
                throw new Error('invalid archive root');
            }
        }
    }
    const bundledWasm = path.join(__dirname, 'libarchive.wasm');
    const wasmPath = fileExists(bundledWasm)
        ? bundledWasm
        : require.resolve('libarchive-wasm/dist/libarchive.wasm');
    const module = await libarchiveWasm({ wasmBinary: fs.readFileSync(wasmPath) });
    const archiveBytes = new Int8Array(fs.readFileSync(archivePath));
    const preserveTarModes = process.platform !== 'win32' && /\.(?:tar\.xz|tar\.gz|tgz)$/i.test(archivePath);
    const tarModes = preserveTarModes ? await readTarModes(archivePath) : null;
    if (root == null) {
        const inspectionReader = new ArchiveReader(module, archiveBytes);
        try {
            archiveRoot = findImplicitArchiveRoot(inspectionReader);
        } finally {
            inspectionReader.free();
        }
    }
    const reader = new ArchiveReader(module, archiveBytes);
    const directoryModes = new Map();
    let entryIndex = 0;

    try {
        for (const entry of reader.entries()) {
            const tarMode = tarModes?.[entryIndex];
            if (tarModes && !tarMode) throw new Error('tar entry count differs from permission listing');
            entryIndex++;
            const entryPath = entry.getPathname().replace(/\\/g, '/');
            const normalized = path.posix.normalize(entryPath);
            const type = entry.getFiletype();
            if (tarMode && ((type === 'Directory' && tarMode.type !== 'd') ||
                (type === 'File' && tarMode.type !== '-') ||
                (type === 'SymbolicLink' && tarMode.type !== 'l'))) {
                throw new Error('tar entry type differs from permission listing');
            }
            const relativePath = archiveRoot == null ? normalized
                : normalized === archiveRoot ? ''
                    : normalized.startsWith(archiveRoot + '/') ? normalized.slice(archiveRoot.length + 1) : null;
            const installPath = relativePath;
            const destination = path.resolve(assetDirectory, installPath || '');
            if (path.posix.isAbsolute(entryPath) || path.win32.isAbsolute(entryPath) ||
                /^[A-Za-z]:/.test(entryPath) ||
                normalized === '..' || normalized.startsWith('../') ||
                destination !== extractionRoot && !destination.startsWith(extractionRoot + path.sep)) {
                throw new Error('invalid archive entry path');
            }

            if (installPath == null) continue;

            for (let parent = path.dirname(destination);
                parent !== extractionRoot && parent.startsWith(extractionRoot + path.sep);
                parent = path.dirname(parent)) {
                if (fs.lstatSync(parent, { throwIfNoEntry: false })?.isSymbolicLink()) {
                    throw new Error('archive entry traverses a symbolic link');
                }
            }

            const symlinkTarget = entry.getSymlinkTarget();
            if (fs.lstatSync(destination, { throwIfNoEntry: false })?.isSymbolicLink()) {
                throw new Error('archive entry overwrites a symbolic link');
            }
            if (entry.getHardlinkTarget()) {
                throw new Error('archive links are unsupported');
            }
            if (type === 'SymbolicLink') {
                if (!symlinkTarget || symlinkTarget === '.' || symlinkTarget === '..' ||
                    symlinkTarget.includes('/') || symlinkTarget.includes('\\') ||
                    /^[A-Za-z]:/.test(symlinkTarget) || destination === assetDirectory) {
                    throw new Error('invalid archive link target');
                }
                fs.mkdirSync(path.dirname(destination), { recursive: true });
                fs.symlinkSync(symlinkTarget, destination);
            } else if (symlinkTarget) {
                throw new Error('archive links are unsupported');
            } else if (type === 'Directory') {
                fs.mkdirSync(destination, { recursive: true });
                if (tarMode) directoryModes.set(destination, tarMode.mode);
            } else if (type === 'File') {
                fs.mkdirSync(path.dirname(destination), { recursive: true });
                const fd = fs.openSync(destination, 'w');
                try {
                    let remaining = entry.getSize();
                    if (!Number.isSafeInteger(remaining) || remaining < 0) {
                        throw new Error('invalid archive entry size');
                    }
                    while (remaining > 0) {
                        const data = reader.readData(Math.min(remaining, 64 * 1024));
                        if (data.length === 0) throw new Error('incomplete archive entry');
                        const buffer = Buffer.from(data);
                        let written = 0;
                        while (written < buffer.length) {
                            written += fs.writeSync(fd, buffer, written);
                        }
                        remaining -= data.length;
                    }
                } finally {
                    fs.closeSync(fd);
                }
                if (tarMode) fs.chmodSync(destination, tarMode.mode);
            } else {
                throw new Error('unsupported archive entry type');
            }
        }
        if (tarModes && entryIndex !== tarModes.length) {
            throw new Error('tar entry count differs from permission listing');
        }
    } finally {
        reader.free();
    }
    for (const [directory, mode] of [...directoryModes].sort((a, b) => b[0].length - a[0].length)) {
        fs.chmodSync(directory, mode);
    }
}


//-----------------------------------------------------------------------------------------------//
// SemVer
//-----------------------------------------------------------------------------------------------//

class SemVer {
    constructor(major=1, minor=0, patch=0) {
        this.major = major;
        this.minor = minor;
        this.patch = patch;
    }

    clone() {
        return new SemVer(this.major, this.minor, this.patch);
    }

    static fromString(semver) {
        const [major, minor, patch] = semver.split('.').map(Number);
        return new SemVer(major, minor, patch);
    }

    toString() {
        return this.major + '.' + this.minor + '.' + this.patch;
    }

    equals(other) {
        return SemVer.compare(this, other);
    }

    isNewer(other) {
        return SemVer.compare(this, other) > 0;
    }

    isOlder(other) {
        return SemVer.compare(this, other) < 0;
    }

    static compare(a, b) {
        if (a == null && b == null) return 0;
        if (a == null) return -1;
        if (b == null) return 1;

        if (a.major > b.major) return 1;
        if (a.major < b.major) return -1;
        if (a.minor > b.minor) return 1;
        if (a.minor < b.minor) return -1;
        if (a.patch > b.patch) return 1;
        if (a.patch < b.patch) return -1;
        return 0;
    }
}


//-----------------------------------------------------------------------------------------------//
// Asset
//-----------------------------------------------------------------------------------------------//
class Asset {
    constructor(name, group, version, id=null, file=null, url=null, root=null) {
        this.id = id || Asset.generateId(name, group, version);
        this.name = name;
        this.group = group;
        this.version = version;
        this.file = file;
        this.url = url;
        this.root = root;
    }

    clone() {
        return new Asset(this.name, this.group, this.version.clone(), this.id, this.file, this.url, this.root);
    }

    static generateId(name, group, _version) {
        return group + "/" + name;
    }

    toString() {
        return this.group + '.' + this.name + " : " + this.version.toString();
    }

    isNewer(other) {
        if (null == other) return true;
        return this.version.isNewer(other.version);
    }

    isOlder(other) {
        if (null == other) return false;
        return this.version.isOlder(other.version);
    }

    equals(other) {
        if (null == other) return false;
        return this.version.equals(other.version);
    }
}

//-----------------------------------------------------------------------------------------------//
// Manifest
//-----------------------------------------------------------------------------------------------//

class Manifest {
    constructor(version = null) {
        this._version = version;
        this._assets = null;
        this._groups = null;
    }

    updateFrom(other) {
        this._version = other._version.clone();
    }

    static fromFile(manifest_path) {
        try {
            const data = fs.readFileSync(manifest_path, 'utf8');
            return Manifest.fromString(data);
        } catch (_err) {
            throw new Error("failed to read manifest file: '" + manifest_path + "'");
        }
    }

    toFile(manifest_path) {
        const data = {};

        data["timestamp"] = new Date().toISOString();
        data["version"] = this._version.toString();

        if (null != this._groups) {
            for (const [group, assets] of this._groups) {
                if (group == "version" || group == "timestamp") continue;
                const group_data = {};
                for (const [_id, asset] of assets || []) {
                    if (asset.file || asset.url || asset.root != null) {
                        group_data[asset.name] = { version: asset.version.toString() };
                        if (asset.file) group_data[asset.name].file = asset.file;
                        if (asset.url) group_data[asset.name].url = asset.url;
                        if (asset.root != null) group_data[asset.name].root = asset.root;
                    } else {
                        group_data[asset.name] = asset.version.toString();
                    }
                }
                data[group] = group_data;
            }
        }

        const json = JSON.stringify(data, null, 4);
        fs.writeFileSync(manifest_path, json, "utf-8");
    }

    static fromString(manifest_str) {
        const jsonManifest = JSON.parse(manifest_str);
        return Manifest.fromJson(jsonManifest);
    }

    static fromJson(jsonManifest) {
        const manifestVersion = jsonManifest["version"];
        if (!manifestVersion) {
            throw new Error("missing version information in manifest");
        }

        const manifest = new Manifest();
        manifest._version = SemVer.fromString(manifestVersion);

        for (let group in jsonManifest) {
            if (group == "version" || group == "timestamp") continue;
            const assets = jsonManifest[group] || [];
            for (let name in assets) {
                const value = assets[name];
                const version = typeof value === 'string' ? value : value.version;
                const semver = SemVer.fromString(version);
                const asset = new Asset(name, group, semver, null, value.file || value.archive || null,
                    value.url || null, value.root ?? null);
                manifest.addAsset(asset);
            }
        }
        return manifest;
    }

    isNewer(other) {
        if (null == other) return true;
        return this._version.isNewer(other._version);
    }

    isOlder(other) {
        if (null == other) return false;
        return this._version.isOlder(other._version);
    }

    equals(other) {
        if (null == other) return false;
        return this._version.equals(other._version);
    }

    addAsset(asset) {
        if (null == this._assets) this._assets = new Map();
        this._assets.set(asset.id, asset)
        const g = this.addGroup(asset.group);
        g.set(asset.id, asset);
    }

    deleteAsset(asset) {
        if (null == this._assets) return;
        this._assets.delete(asset.id);
        if (this._assets.length == 0) this._assets = null;
        const g = this.getGroup(asset.group);
        if (g) {
            g.delete(asset.id);
            if (g.length == 0) this.deleteGroup(asset.group);
        }
    }

    getAsset(asset) {
        if (null == this._assets) return null;
        return this._assets.get(asset.id);
    }

    hasAsset(asset) {
        return this.getAsset(asset) != undefined;
    }

    addGroup(group) {
        if (null == this._groups) this._groups = new Map();

        let g = this.getGroup(group);
        if (!g) {
            g = new Map();
            this._groups.set(group, g);
        }
        return g;
    }

    deleteGroup(group) {
        if (null == this._groups) return;
        this._groups.delete(group);
        if (this._groups.length == 0) this._groups = null;
    }

    getGroup(group) {
        if (null == this._groups) return null;
        return this._groups.get(group);
    }

    hasGroup(group) {
        const g = this.getGroup(group);
        return (g != null);
    }

    forEach(f, ...args) {
        if (null == this._assets) return;
        let ret = undefined;
        for (const [_id, asset] of this._assets) {
            const localRet = f(asset, ...args);
            if (ret === undefined) ret = localRet;
        }
        return ret;
    }

    getGroupAssets(groups) {
        groups = groups || PackageManager.getDefaultGroups();
        const assets = [];
        this.forEach((asset) => {
            if (groups == null || groups.length == 0 || groups.indexOf(asset.group) >= 0) {
                assets.push(asset);
            }
        });
        return assets;
    }
}

//-----------------------------------------------------------------------------------------------//
// PackageManager
//-----------------------------------------------------------------------------------------------//

class PackageManager {
    constructor(appName, repositoryUrl, localDirectory=null, onProgress=undefined) {
        this._app = appName
        this._remoteUrl = repositoryUrl;
        this._remoteManifestUrl = null != this._remoteUrl ? resolveUrl(this._remoteUrl, MANIFEST_FILE) : null;
        this._remoteManifest = null;
        this._localDir = localDirectory || PackageManager.getUserAppDir(appName);
        this._localManifestPath = path.join(this._localDir, MANIFEST_FILE);
        this._localManifest = null;
        this._localTempDir = path.join(this._localDir, TEMP_FOLDER);
        this._callback = onProgress;
        this._callbackAsset = null;
        this._downloader = new Downloader(this.downloadCallbackHandler.bind(this));
        this._connected = false;
        this._cancelled = false;
    }

    get connected() {
        return this._connected;
    }

    set callback(onProgress) {
        this._callback = onProgress;
    }

    set callbackAsset(asset) {
        this._callbackAsset = asset;
    }

    _throwIfCancelled() {
        if (this._cancelled) {
            throw new Error("cancelled");
        }
    }

    get localDir() { return this._localDir; }

    downloadCallbackHandler(progressInfo) {
        if (this._cancelled) {
            return true;
        }

        if (this._callback) {
            const shouldCancel = this._callback(progressInfo, this._callbackAsset);
            if (shouldCancel === true) {
                this._cancelled = true;
            }
            return shouldCancel;
        }
    }

    disconnect() {
        this._cleanup();
        this._connected = false;
        this._remoteManifest = null;
        this._localManifest = null;
    }

    async connect(onProgress=null) {
        this._cancelled = false;
        this._check(true);
        this._cleanup();

        if (onProgress) {
            this.callback = onProgress;
        }

        let data;

        try {
            data = await this._downloader.downloadToString(this._remoteManifestUrl);
            this._throwIfCancelled();
        } catch (_err) {
            this._remoteManifest = null;
            throw new Error("failed to fetch repository manifest '" + this._remoteManifestUrl + "'");
        }

        try {
            this._remoteManifest = Manifest.fromString(data);
        } catch (_err) {
            console.log("manifest parsing error: " + _err);
            this._remoteManifest = null;
            throw new Error("invalid manifest format");
        }

        try {
            this._localManifest = Manifest.fromFile(this._localManifestPath);
        } catch(_err) {
            this._localManifest = new Manifest();
        }

        this._throwIfCancelled();
        this._connected = true;
    }

    async install(groups=null, force=false) {
        this._throwIfCancelled();
        this._check();
        this._cleanup();
        this._setup();

        if (!force && this._remoteManifest.isOlder(this._localManifest)) {
            console.log("local installation is newer than remote")
            return;
        }

        await this.installAssets(groups, false, force);

        this._throwIfCancelled();
        this._localManifest.updateFrom(this._remoteManifest);
        this._localManifest.toFile(this._localManifestPath);
        this._cleanup();
    }

    async update(groups=null) {
        this._throwIfCancelled();
        this._check();
        this._cleanup();
        await this.installAssets(groups, true);
        this._throwIfCancelled();
        this._cleanup();
    }

    async uninstall(groups=null) {
        this._throwIfCancelled();
        this._check(true);
        this._cleanup();
        await this.uninstallAssets(groups);
        this._localManifest.toFile(this._localManifestPath);
        this._cleanup();
    }

    uninstallAll() {
        if (this._localDir) {
            fs.rmSync(this._localDir, { recursive: true, force: true });
            this._cleanup();
        }
    }

    async reinstall(groups=null) {
        await this.uninstall(groups);
        await this.install(groups);
    }

    async installAssets(groups=null, updateOnly=false, force=false) {
        this._throwIfCancelled();
        this._check();

        const remoteManifest = this._remoteManifest;
        const localManifest = this._localManifest;

        if (updateOnly) {
            const localAssets = localManifest.getGroupAssets(groups);
            for (const localAsset of localAssets) {
                this._throwIfCancelled();
                const remoteAsset = remoteManifest.getAsset(localAsset);
                if (force || !this.exists(localAsset) || localAsset.isOlder(remoteAsset)) {
                    await this.installAsset(remoteAsset, updateOnly);
                }
            }
        } else {
            const remoteAssets = remoteManifest.getGroupAssets(groups);
            for (const remoteAsset of remoteAssets) {
                this._throwIfCancelled();
                const localAsset = localManifest.getAsset(remoteAsset);
                if (force || !localAsset || !this.exists(localAsset) || localAsset.isOlder(remoteAsset)) {
                    await this.installAsset(remoteAsset, updateOnly);
                }
            }
        }
    }

    async uninstallAssets(groups=null) {
        this._check(true);
        const localManifest = this._localManifest;
        const localAssets = localManifest.getGroupAssets(groups);
        for (const localAsset of localAssets) {
            await this.uninstallAsset(localAsset);
        }
    }

    async installAsset(asset, updateOnly=false) {
        this._throwIfCancelled();
        //const remoteManifest = this._remoteManifest;
        const localManifest = this._localManifest;

        const assetInstallInfo = this.getAssetInstallInfo(asset);
        if (null == assetInstallInfo) return;

        this._cleanup();
        this._throwIfCancelled();

        this.callbackAsset = asset;

        if (localManifest.hasAsset(asset)) {
            await this.uninstallAsset(asset, true);
        } else {
            fs.rmSync(assetInstallInfo.installDir, { recursive: true, force: true });
        }

        console.log((updateOnly ? "updating" : "installing") + ' ' + asset.toString());

        const downloader = this._downloader;
        await downloader.download(assetInstallInfo.sourceUrl, assetInstallInfo.tempFile);
        this._throwIfCancelled();

        if (!fileExists(assetInstallInfo.tempFile)) {
            throw new Error("downloading of '" + asset.name + "' failed.");
        }

        try {
            await extractArchive(assetInstallInfo.tempFile, assetInstallInfo.tempDir, asset.root, asset.name);
        } catch (_err) {
            throw new Error("extracting '" + asset.name + "' failed.");
        }

        this._throwIfCancelled();
        const tempInstallDir = path.join(assetInstallInfo.tempDir, asset.name);
        fs.renameSync(tempInstallDir, assetInstallInfo.installDir);

        this._cleanup();
        this._throwIfCancelled();

        localManifest.addAsset(asset);
    }

    async uninstallAsset(asset, silent=false) {
        if (!silent) console.log("uninstalling " + asset.toString());

        const assetInstallInfo = this.getAssetInstallInfo(asset);
        if (null == assetInstallInfo) return;

        this.callbackAsset = asset;

        fs.rmSync(assetInstallInfo.installDir, { recursive: true, force: true });

        const localManifest = this._localManifest;
        localManifest.deleteAsset(asset);
    }

    exists(asset) {
        if (null == asset || !asset.name) return false;

        const assetInstallInfo = this.getAssetInstallInfo(asset);
        if (null == assetInstallInfo) return false;

        return dirExists(assetInstallInfo.installDir);
    }

    getAssetInstallInfo(asset) {
        if (null == asset || !asset.name) return null;

        const name = asset.name;
        const archiveName = asset.file || asset.name + ".zip";
        if (path.basename(archiveName) !== archiveName || archiveName === '.' || archiveName === '..') {
            throw new Error('invalid archive filename');
        }
        const sourceUrl = asset.url || resolveUrl(this._remoteUrl, asset.group + '/' + archiveName);
        const installDir = path.join(this._localDir, name);
        const tempFile = path.join(this._localTempDir, archiveName);
        const tempDir = path.join(this._localTempDir, 'contents');

        const info = {
            name: name,
            archiveName: archiveName,
            sourceUrl: sourceUrl,
            installDir: installDir,
            tempFile: tempFile,
            tempDir: tempDir
        }

        return info;
    }

    static getDefaultGroups() {
        return [ GENERIC_GROUP, PackageManager.getPlatformId() ];
    }

    static getPlatformId() {
        return PLATFORM_IDS[process.platform];
    }

    static getUserAppDir(appName=null) {
        const platform = process.platform;

        let userAppDir = null;

        if (platform === "win32") {
            userAppDir = path.join(process.env.LOCALAPPDATA, "Programs");
        } else if (platform === "darwin") {
            userAppDir = path.join(os.homedir(), "Applications");
        } else {
            userAppDir = path.join(os.homedir(), ".local", "share");
        }

        if (appName) {
            userAppDir = path.join(userAppDir, appName + (platform === "darwin" ? ".app" : ""));
        }

        return userAppDir;
    }

    _check(ignoreConnection=false) {
        if ((false == this._connected && !ignoreConnection) ||
            !this._app || !this._localDir || !this._remoteUrl) {
            throw new Error("invalid configuration");
        }
    }

    _setup() {
        // init local install folder
        if (!dirExists(this._localDir)) {
            fs.mkdirSync(this._localDir, { recursive: true });
        }
    }

    _cleanup() {
        if (this._localTempDir) fs.rmSync(this._localTempDir, { recursive: true, force: true });
        this._callbackAsset = null;
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    PackageManager: PackageManager
};
