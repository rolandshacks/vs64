//
// Device
//


//-----------------------------------------------------------------------------------------------//
// Disk IO
//-----------------------------------------------------------------------------------------------//

class VirtualDeviceIO {
    writeFile(_filename, _buffer) {
        throw new Error("file system access disabled");
    }

    readFile(_filename) {
        throw new Error("file system access disabled");
    }
}

//-----------------------------------------------------------------------------------------------//
// Virtual Device
//-----------------------------------------------------------------------------------------------//

class Device {
    constructor(filename, filesystemIO=null) {
        this._io = filesystemIO || new VirtualDeviceIO();
        this._deviceType = Device.DEVICE_TYPE_UNKNOWN;
        this.init();
        if (filename != null) {
            this.open(filename);
        }
    }

    init() {
        this._buffer = null;
        this._filename = null;
        this._size = 0;
        this._name = null;
        this._version = null;
        this._directory = null;
    }

    get deviceType() { return this._deviceType; }
    get is_open() { return this._buffer != null; }
    get size() { return this._size; }
    get name() { return this._name || ""; }
    get version() { return this._version || "2"; }
    get directory() { return this._directory || []; }

    open(filename) {
        this.close();

        if (filename == null || filename.length < 1) {
            throw new Error("invalid arguments");
        }

        let buffer = null;

        try {
            buffer = this._io.readFile(filename);
        } catch (_err) {
            throw new Error("failed to open disk file '" + filename + "'");
        }

        this.fromRawBuffer(buffer);

        this._filename = filename;
    }

    openFromBuffer(buffer, filename) {
        this.close();
        this.fromRawBuffer(buffer);
        this._filename = filename;
    }

    close() {
        this.init();
    }

    flush() {}

    fromRawBuffer(_buffer) {
        throw new Error("feature not implemented");
    }

    renameFile(_name, _newName) {
        throw new Error("feature not implemented");
    }

    readFile(_name) {
        throw new Error("feature not implemented");
    }

    seekFile(name) {
        if (name == null || name.length < 1) {
            throw new Error("invalid arguments");
        }

        for (const entry of this.directory) {
            if (name == entry.name) {
                return entry;
            }
        }

        return null;
    }

    deleteFile(_name) {
        throw new Error("feature not implemented");
    }

    writeFile(_name, _type, _buffer, _overwrite) {
        throw new Error("feature not implemented");
    }

    storeFile(_filename, _name, _type, _overwrite) {
        throw new Error("feature not implemented");
    }

    write(_filename) {
        throw new Error("feature not implemented");
    }

    readDirectory() {
        throw new Error("feature not implemented");
    }

    writeDirectory() {
        throw new Error("feature not implemented");
    }

    addDirectoryEntry(file) {
        if (null == file) {
            throw new Error("invalid directory file entry");
        }

        if (null == this._directory) {
            this._directory = [];
        }

        this._directory.push(file);
    }

    static getFsName(name) {

        if (null == name || name.length < 1) return name;

        let fsName = "";

        for (let i=0; i<name.length; i++) {
            let c = name[i];
            if (Device.FILESYSTEM_CHARS.indexOf(c) == -1) {
                c = '_';
            } else {
                c = c.toUpperCase();
            }
            fsName += c;
        }

        return fsName;
    }

    seekFileFs(name) {
        if (name == null || name.length < 1) {
            throw new Error("invalid arguments");
        }

        const fsName = Device.getFsName(name);

        for (const entry of this.directory) {
            if (fsName == entry.fsName) {
                return entry;
            }
        }

        return null;
    }

    exportFile(name, filename) {
        if (filename == null || filename.length < 1 || name == null || name.length < 1) {
            throw new Error("invalid arguments");
        }

        const buffer = this.readFile(name);

        if (null == buffer) {
            throw new Error("failed to read file '" + name + "'");
        }

        try {
            this._io.writeFile(filename, buffer, 'binary');
        } catch (_err) {
            throw new Error("failed to export file '" + name + "' to '" + filename + "'");
        }
    }

    static getTypeFromName(name) {
        if (name == null || name.length < 1) return null;

        let type = File.TYPE_USR;

        const pos = name.lastIndexOf('.');
        if (pos != -1) {
            const ext = name.substring(pos+1).toLowerCase();
            if (ext == "prg") type = File.TYPE_PRG;
            else if (ext == "seq") type = File.TYPE_SEQ;
            else if (ext == "rel") type = File.TYPE_REL;
        }

        return type;
    }

    readChunk(ofs, len) {
        const buffer = this._buffer;
        if (null == buffer) return  null;

        if (null == buffer || ofs < 0 || len < 1 || ofs + len > buffer.length) {
            throw new Error("illegal device read access");
            //return null;
        }

        return buffer.subarray(ofs, ofs + len);
    }

    writeChunk(ofs, len, data) {
        if (null == data || data.length < 1) return;

        const buffer = this._buffer;
        const source_len = Math.min(len, data.length);

        if (null == buffer || ofs < 0 || len < 1 || ofs + len > buffer.length) {
            throw new Error("illegal device write access");
            //return;
        }

        buffer.set(data, ofs, source_len);

        if (len > source_len) {
            // fill with zeros
            buffer.set(Device.ZEROES, ofs + source_len, len - source_len);
        }
    }

    toString() {
        return this.name;
    }

    showStats() {
        console.log("--------- DEVICE INFO ---------");
        console.log("File: " + (this.filename || "no filename"));
        console.log("Name: \"" + this.name + "\"");

        console.log("--------- DIRECTORY ----------");
        for (const entry of this.directory) {
            console.log(entry.toString());
        }
    }
}

Device.DEVICE_TYPE_UNKNOWN = 0;
Device.DEVICE_TYPE_DISK = 1;
Device.DEVICE_TYPE_TAPE = 2;

Device.FILESYSTEM_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_+-. !\"\'$=";
Device.ZEROES = new Uint8Array(1024);

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Device: Device,
    VirtualDeviceIO: VirtualDeviceIO
};
