//
// D64 Disk File Sysetem
//

const vscode = require('vscode');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { Logger } = require('logger/logger');

const { Disk, Tape } = require('media/media');

const logger = new Logger("D64DiskFs");

function ufmt(uri, filename) {
    if (null != filename && filename.length > 0) {
        return "('" + uri.query + "/" + filename + "')";
    } else {
        return "('" + uri.query + "')";
    }
}

//-----------------------------------------------------------------------------------------------//
// Helpers
//-----------------------------------------------------------------------------------------------//

class FileSystemWatchDisposable {
    constructor(fsProvider, uri, options) {
        this._fsProvider = fsProvider;
        this._uri = uri;
        this._options = options;
    }

    dispose() {
        if (null != this._fsProvider && null != this._uri) {
            this._fsProvider.closeFile(this._uri);
            this._uri = null;
        };
    }
}

class FileSystemCache {
    constructor() {
        this._cache = new Map();
    }

    getKey(uri) {
        return uri.query;
    }

    clear() {
        logger.debug("cache clear");
        this._cache.clear();
    }

    get(uri) {
        const key = this.getKey(uri);
        logger.trace("#cacheGet('" + key + "')");
        const data = this._cache.get(key);
        if (null == data) {
            logger.trace("#cacheGet(): cache miss '" + key + "'");
        }
        return data;
    }

    put(uri, data) {
        const key = this.getKey(uri);
        if (null != data) {
            logger.trace("#cachePut('" + key + "')");
            this._cache.set(key, data);
        } else {
            logger.trace("#cacheRemove('" + key + "')");
            this._cache.delete(key);
        }
    }

    remove(uri) {
        this.put(uri, null);
    }

}

//-----------------------------------------------------------------------------------------------//
// D64 Disk File System
//-----------------------------------------------------------------------------------------------//

class BaseFileSystemProvider {
    constructor() {
        this._cache = new FileSystemCache();
    }

    #getFsUri(uri) {
        if (null == uri) return null;
        return vscode.Uri.parse(uri.query);
    }

    async #getDevice(uri) {
        logger.trace("#getDevice" + ufmt(uri));

        { // get from cache
            const device = this._cache.get(uri);
            if (null != device) return device;
        }

        const buffer = await vscode.workspace.fs.readFile(this.#getFsUri(uri));
        if (null == buffer) {
            throw new Error("failed to read image from uri '" + uri.toString() + "'");
        }

        const deviceType = uri.scheme;

        const device = (deviceType == "t64") ? new Tape() : new Disk();

        if (buffer.length == 0) {
            if (deviceType == "d64") {
                vscode.window.showErrorMessage("Disk file was empty. Auto-formatted to standard 35 track 1541 disk.")
                device.create("VS64DISK", "64", 35);
                // flush back to file
                await vscode.workspace.fs.writeFile(this.#getFsUri(uri), device.image);
            } else {
                throw new Error("failed to read image from uri '" + uri.toString() + "'");
            }
        } else {
            device.openFromBuffer(buffer);
        }

        this._cache.put(uri, device)

        return device;
    }

    async openFile(uri) { // throws
        logger.trace("openFile" + ufmt(uri));
        return this.#getDevice(uri);
    }

    closeFile(uri) {
        logger.trace("closeFile" + ufmt(uri));
        this._cache.remove(uri);
    }

    onDidChangeFile(_listener) {}

    watch(uri, options) {
        logger.trace("watch" + ufmt(uri));
        // ignore, just return disposable
        return new FileSystemWatchDisposable(this, uri, options);
    }

    #getDevicePath(uri) {
        let pos = uri.path.indexOf('/', 1);
        if (pos == -1) return "";

        const p = uri.path.substring(pos+1);
        return p;
    }

    async stat(uri) {

        const filename = this.#getDeviceFilename(this.#getDevicePath(uri));

        logger.trace("stat" + ufmt(uri, filename));

        let disk = null;
        try { disk = await this.#getDevice(uri); } catch (_e) {}

        if (null == disk) {
            logger.error("stats(): failed to access disk with uri '" + uri.toString() + "'");
            //vscode.window.showErrorMessage("Failed to mount disk: " + e);
            return null;
        }

        if (null == filename || filename.length < 1) {
            return new FileSystemNodeStats(true);
        }

        const diskFile = disk.seekFileFs(filename);
        if (null == diskFile) {
            logger.error("file not found '" + filename + "'");
            return null;
        }

        return new FileSystemNodeStats(false, diskFile.size);
    }

    async readDirectory(uri) {
        logger.trace("readDirectory" + ufmt(uri));

        let device;
        try { device = await this.#getDevice(uri); } catch (_e) {}

        if (null == device) {
            logger.error("readDirectory(): failed to access disk with uri '" + uri.toString() + "'");
            return null;
        }

        let entries = [];

        for (const entry of device.directory) {
            let name = entry.fsName;
            if (name.indexOf('.') == -1) name += "." + entry.typeName.toLowerCase();
            entries.push([name, vscode.FileType.File]);
        }

        return entries;
    }

    #getDeviceFilename(filename) {
        if (null == filename || filename.length < 1) return filename;

        const pos = filename.lastIndexOf('.');
        if (pos < 0) return filename;

        const ext = filename.substring(pos+1).toLowerCase();
        if (["prg", "usr", "seq", "rel"].indexOf(ext) == -1) return filename;

        const d64Name = filename.substring(0, pos);

        return d64Name;
    }

    async readFile(uri) {
        const filename = this.#getDeviceFilename(this.#getDevicePath(uri));
        logger.trace("readFile" + ufmt(uri, filename));

        if (null == filename || filename.length < 1) {
            logger.error("readFile(): could not get filename from uri '" + uri.toString() + "'");
            return null;
        }

        let device = null;
        try { device = await this.#getDevice(uri); } catch (_e) {}

        if (null == device) {
            logger.error("readFile(): failed to access disk with uri '" + uri.toString() + "'");
            return null;
        }

        const diskFile = device.seekFileFs(filename);
        if (null == diskFile) {
            logger.error("readFile(): file not found '" + filename + "'");
            return null;
        }

        const buffer = device.readFile(diskFile.name);

        return buffer;
    }

    createDirectory(uri) {
        logger.trace("createDirectory" + ufmt(uri));

        throw new Error("create directory is not implemented for D64 files");
    }

    async writeFile(uri, content, _options) {
        const filePath = this.#getDevicePath(uri);
        const filename = this.#getDeviceFilename(filePath);
        if (null == filename || filename.length < 1) {
            logger.error("writeFile(): could not get filename from uri '" + uri.toString() + "'");
            return;
        }

        logger.trace("writeFile" + ufmt(uri, filename));

        let device = null;
        try { device = await this.#getDevice(uri); } catch (_e) {}

        if (null == device) {
            logger.error("writeFile(): failed to access disk with uri '" + uri.toString() + "'");
            return;
        }

        const fileType = Disk.getTypeFromName(filePath);
        const fsName = Disk.getFsName(filename);

        device.writeFile(fsName, fileType, content, true);

        // flush back to file
        await vscode.workspace.fs.writeFile(this.#getFsUri(uri), device.image);

    }

    async delete(uri, _options) {

        const filename = this.#getDeviceFilename(this.#getDevicePath(uri));
        if (null == filename || filename.length < 1) {
            logger.error("delete(): could not get filename from uri '" + uri.toString() + "'");
            return;
        }

        logger.trace("delete" + ufmt(uri, filename));

        let disk = null;
        try { disk = await this.#getDevice(uri); } catch (_e) {}

        if (null == disk) {
            logger.error("delete(): failed to access disk with uri '" + uri.toString() + "'");
            return;
        }

        const diskFile = disk.seekFileFs(filename);
        if (null == diskFile) {
            logger.error("delete(): file not found '" + filename + "'");
            return;
        }

        disk.deleteFile(diskFile.name);

        // flush back to file
        await vscode.workspace.fs.writeFile(this.#getFsUri(uri), disk.image);
    }

    async rename(uri, newUri, _options) {

        const filename = this.#getDeviceFilename(this.#getDevicePath(uri));
        const newFilename = this.#getDeviceFilename(this.#getDevicePath(newUri));

        if (null == filename || filename.length < 1 || null == newFilename || newFilename.length < 1) {
            logger.error("rename(): could not get filename from uri '" + uri.toString() + "'");
            return;
        }

        logger.trace("rename" + ufmt(uri, filename));

        let disk = null;
        try { disk = await this.#getDevice(uri); } catch (_e) {}

        if (null == disk) {
            logger.error("rename(): failed to access disk with uri '" + uri.toString() + "'");
            return;
        }

        const diskFile = disk.seekFileFs(filename);
        if (null == diskFile) {
            logger.error("rename(): file not found '" + filename + "'");
            return;
        }

        if (null != disk.renameFile(diskFile.name, newFilename)) {
            // success indicated by new returned directory entry
            // flush back to file
            await vscode.workspace.fs.writeFile(this.#getFsUri(uri), disk.image);
        }

    }

    copy(source, _destination, _options) {
        logger.trace("copy" + ufmt(source));
        throw new Error("copying files is not implemented for D64 files");
    }

}

class FileSystemNodeStats {
    constructor(isDirectory, size) {
        this.type = isDirectory ? vscode.FileType.Directory : vscode.FileType.File;
        this.permissions = 0; // vscode.FilePermission.Readonly;
        this.size = size || 0;
        this.ctime = 0;
        this.mtime = 0;
    }
}

class D64FileSystemProvider extends BaseFileSystemProvider {
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    D64FileSystemProvider: D64FileSystemProvider
};
