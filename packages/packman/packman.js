//
// Package Manager
//

const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require("adm-zip");

const Downloader = require('./downloader');

const PLATFORM_IDS = {
    darwin: 'mac',
    linux: 'linux',
    win32: 'win',
};

const MANIFEST_FILE = "packages.json";
const TEMP_FILE = "_temp_pack.zip"
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

function _isZipFile(filename) {
    return path.extname(filename).toLowerCase() === ".zip";
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
    constructor(name, group, version, id=null) {
        this.id = id || Asset.generateId(name, group, version);
        this.name = name;
        this.group = group;
        this.version = version;
    }

    clone() {
        return new Asset(this.name, this.group, this.version.clone(), this.id);
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
                    group_data[asset.name] = asset.version.toString();
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
                const version = assets[name];
                const semver = SemVer.fromString(version);
                const asset = new Asset(name, group, semver);
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
        this._localTempFile = path.join(this._localDir, TEMP_FILE);
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

        try {
            const data = await this._downloader.downloadToString(this._remoteManifestUrl);
            this._throwIfCancelled();
             this._remoteManifest = Manifest.fromString(data);
        } catch (_err) {
            this._remoteManifest = null;
            throw new Error("failed to fetch repository manifest '" + this._remoteManifestUrl + "'");
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
            const zip = new AdmZip(assetInstallInfo.tempFile);
            zip.extractAllTo(assetInstallInfo.tempDir, true, true);
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
        const archiveName = asset.name + ".zip";
        const sourceUrl = resolveUrl(this._remoteUrl, asset.group + '/' + archiveName);
        const installDir = path.join(this._localDir, name);
        const tempFile = this._localTempFile;
        const tempDir = this._localTempDir;

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
        if (this._localTempFile) fs.rmSync(this._localTempFile, { force: true });
        this._callbackAsset = null;
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    PackageManager: PackageManager
};
