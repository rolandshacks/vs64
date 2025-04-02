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
const { Logger } = require('utilities/logger');

const { Disk } = require('disk/disk');

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

class D64Disposable {
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

//-----------------------------------------------------------------------------------------------//
// D64 Disk File System
//-----------------------------------------------------------------------------------------------//

class D64FileSystemProvider {
    constructor() {
        this._cache = new Map();
    }

    #getFsUri(uri) {
        if (null == uri) return null;
        return vscode.Uri.parse(uri.query);
    }

    #cacheGetKey(uri) {
        return uri.query;
    }

    #cacheClear() {
        logger.debug("cache clear");
        this._cache.clear();
    }

    #cacheGet(uri) {
        const key = this.#cacheGetKey(uri);
        logger.trace("#cacheGet('" + key + "')");
        const data = this._cache.get(key);
        if (null == data) {
            logger.trace("#cacheGet(): cache miss '" + key + "'");
        }
        return data;
    }

    #cachePut(uri, data) {
        const key = this.#cacheGetKey(uri);
        if (null != data) {
            logger.trace("#cachePut('" + key + "')");
            this._cache.set(key, data);
        } else {
            logger.trace("#cacheRemove('" + key + "')");
            this._cache.delete(key);
        }
    }

    #cacheRemove(uri) {
        this.#cachePut(uri, null);
    }

    async #getDisk(uri) {
        logger.trace("#getDisk" + ufmt(uri));

        { // get from cache
            const disk = this.#cacheGet(uri);
            if (null != disk) return disk;
        }

        const buffer = await vscode.workspace.fs.readFile(this.#getFsUri(uri));
        if (null == buffer) {
            throw new Error("failed to read disk image from uri '" + uri.toString() + "'");
        }

        const disk = new Disk();

        if (buffer.length == 0) {
            vscode.window.showErrorMessage("Disk file was empty. Auto-formatted to standard 35 track 1541 disk.")
            disk.create("VS64DISK", "64", 35);
            // flush back to file
            await vscode.workspace.fs.writeFile(this.#getFsUri(uri), disk.image);

        } else {
            disk.openFromBuffer(buffer);
        }

        this.#cachePut(uri, disk)

        return disk;
    }

    async openFile(uri) { // throws
        logger.trace("openFile" + ufmt(uri));
        return this.#getDisk(uri);
    }

    closeFile(uri) {
        logger.trace("closeFile" + ufmt(uri));
        this.#cacheRemove(uri);
    }

    onDidChangeFile(_listener) {}

    watch(uri, options) {
        logger.trace("watch" + ufmt(uri));
        // ignore, just return disposable
        return new D64Disposable(this, uri, options);
    }

    #getDiskPath(uri) {
        let pos = uri.path.indexOf('/', 1);
        if (pos == -1) return "";

        const p = uri.path.substring(pos+1);
        return p;
    }

    async stat(uri) {

        const filename = this.#getD64Name(this.#getDiskPath(uri));

        logger.trace("stat" + ufmt(uri, filename));

        let disk = null;
        try { disk = await this.#getDisk(uri); } catch (_e) {}

        if (null == disk) {
            logger.error("stats(): failed to access disk with uri '" + uri.toString() + "'");
            //vscode.window.showErrorMessage("Failed to mount disk: " + e);
            return null;
        }

        if (null == filename || filename.length < 1) {
            return new D64Stats(true);
        }

        const diskFile = disk.seekFileFs(filename);
        if (null == diskFile) {
            logger.error("file not found '" + filename + "'");
            return null;
        }

        return new D64Stats(false, diskFile.size);
    }

    async readDirectory(uri) {
        logger.trace("readDirectory" + ufmt(uri));

        let disk;
        try { disk = await this.#getDisk(uri); } catch (_e) {}

        if (null == disk) {
            logger.error("readDirectory(): failed to access disk with uri '" + uri.toString() + "'");
            return null;
        }

        let entries = [];

        for (const entry of disk.directory) {
            let name = entry.fsName;
            if (name.indexOf('.') == -1) name += "." + entry.typeName.toLowerCase();
            entries.push([name, vscode.FileType.File]);
        }

        return entries;
    }

    #getD64Name(filename) {
        if (null == filename || filename.length < 1) return filename;

        const pos = filename.lastIndexOf('.');
        if (pos < 0) return filename;

        const ext = filename.substring(pos+1).toLowerCase();
        if (["prg", "usr", "seq", "rel"].indexOf(ext) == -1) return filename;

        const d64Name = filename.substring(0, pos);

        return d64Name;
    }

    async readFile(uri) {
        const filename = this.#getD64Name(this.#getDiskPath(uri));
        logger.trace("readFile" + ufmt(uri, filename));

        if (null == filename || filename.length < 1) {
            logger.error("readFile(): could not get filename from uri '" + uri.toString() + "'");
            return null;
        }

        let disk = null;
        try { disk = await this.#getDisk(uri); } catch (_e) {}

        if (null == disk) {
            logger.error("readFile(): failed to access disk with uri '" + uri.toString() + "'");
            return null;
        }

        const diskFile = disk.seekFileFs(filename);
        if (null == diskFile) {
            logger.error("readFile(): file not found '" + filename + "'");
            return null;
        }

        const buffer = disk.readFile(diskFile.name);

        return buffer;
    }

    createDirectory(uri) {
        logger.trace("createDirectory" + ufmt(uri));

        throw new Error("create directory is not implemented for D64 files");
    }

    async writeFile(uri, content, _options) {
        const filePath = this.#getDiskPath(uri);
        const filename = this.#getD64Name(filePath);
        if (null == filename || filename.length < 1) {
            logger.error("writeFile(): could not get filename from uri '" + uri.toString() + "'");
            return;
        }

        logger.trace("writeFile" + ufmt(uri, filename));

        let disk = null;
        try { disk = await this.#getDisk(uri); } catch (_e) {}

        if (null == disk) {
            logger.error("writeFile(): failed to access disk with uri '" + uri.toString() + "'");
            return;
        }

        const fileType = Disk.getTypeFromName(filePath);
        const fsName = Disk.getFsName(filename);

        disk.writeFile(fsName, fileType, content, true);

        // flush back to file
        await vscode.workspace.fs.writeFile(this.#getFsUri(uri), disk.image);

    }

    async delete(uri, _options) {

        const filename = this.#getD64Name(this.#getDiskPath(uri));
        if (null == filename || filename.length < 1) {
            logger.error("delete(): could not get filename from uri '" + uri.toString() + "'");
            return;
        }

        logger.trace("delete" + ufmt(uri, filename));

        let disk = null;
        try { disk = await this.#getDisk(uri); } catch (_e) {}

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

        const filename = this.#getD64Name(this.#getDiskPath(uri));
        const newFilename = this.#getD64Name(this.#getDiskPath(newUri));

        if (null == filename || filename.length < 1 || null == newFilename || newFilename.length < 1) {
            logger.error("rename(): could not get filename from uri '" + uri.toString() + "'");
            return;
        }

        logger.trace("rename" + ufmt(uri, filename));

        let disk = null;
        try { disk = await this.#getDisk(uri); } catch (_e) {}

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

class D64Stats {
    constructor(isDirectory, size) {
        this.type = isDirectory ? vscode.FileType.Directory : vscode.FileType.File;
        this.permissions = 0; // vscode.FilePermission.Readonly;
        this.size = size || 0;
        this.ctime = 0;
        this.mtime = 0;
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    D64FileSystemProvider: D64FileSystemProvider
};
