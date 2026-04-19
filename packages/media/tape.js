//
// Tape
//

const { Device } = require('./device');
const { File } = require('./filesystem');
const { BufferedReader } = require('./buffered_reader');

class Tape extends Device {
    constructor(filename, filesystemIO=null) {
        super(filename, filesystemIO);
        this._version = "0";
        this._deviceType = Device.DEVICE_TYPE_TAPE;
        this._reader = null;
        this._directorySize = 0;
    }

    init() {
        super.init();
    }

    fromRawBuffer(buffer) {
        if (null == buffer || buffer.length < 1) {
            throw new Error("invalid tape data");
        }

        this._buffer = buffer;
        this._size = this._buffer.length;

        this._reader = new BufferedReader(this._buffer);
        this._reader.littleEndian = true;

        this.readMeta();
        this.readDirectory();
    }

    readMeta() {

        const reader = this._reader;
        const tape = this;

        const fileSize = reader.avail;
        if (fileSize < 64) {
            throw new Error("invalid tape file size");
        }

        const magic = reader.readChars(32).toUpperCase();
        if (magic.indexOf("C64") == -1 || magic.indexOf("TAPE") == -1) {
            throw new Error("invalid file magic string");
        }

        tape._version = (reader.readWord() & 0xff).toString();
        tape._directorySize = reader.readWord();

        const _numFiles = reader.readWord();
        const _reserved = reader.readWord();

        tape._name = reader.readChars(24).trim();
    }

    readDirectory() {
        const reader = this._reader;
        reader.set_pos(64); // seek directory entries

        const directorySize = this._directorySize;

        this._directory = null;

        for (let i=0; i<directorySize; i++) {
            if (reader.avail < 32) break;

            const emuFileType = reader.readByte();
            if (emuFileType == 0x0) {
                // don't read empty entries
                reader.skip(31);
                continue;
            }

            const fileType = reader.readByte();
            const startAddr = reader.readWord();
            const endAddr = reader.readWord();
            reader.skipWord();
            const dataOffset = reader.readInt(4);
            reader.skip(4);
            const filename = reader.readChars(16).trim();

            const file = new File(
                filename,
                fileType != 0x0 ? File.TYPE_PRG : File.TYPE_USR,
                File.FLAG_CLOSED,
                Math.max(0, (endAddr - startAddr)),
                dataOffset,
                null,
                startAddr
            );

            this.addDirectoryEntry(file);
        }
    }

    readFile(name) {
        const file = this.seekFile(name);
        if (null == file) {
            throw new Error("file not found: " + name);
        }

        let buffer = null;

        if (file.type == File.TYPE_PRG) {
            // store PRG load address at the beginning 2 bytes
            buffer = new Uint8Array(file.size + 2);
            buffer[0] = (file.loadAddr & 0xff);
            buffer[1] = ((file.loadAddr >> 8) & 0xff);
            buffer.set(this._buffer.subarray(file.position, file.position + file.size), 2);
        } else {
            buffer = this._buffer.subarray(file.position, file.position + file.size);
        }

        return buffer;
    }

    showStats() {
        console.log("--------- TAPE INFO ---------");
        console.log("File: " + (this.filename || "no filename"));
        console.log("Name: \"" + this.name + "\"");
        console.log("Version: " + this.version);

        console.log("--------- DIRECTORY ----------");
        for (const entry of this.directory) {
            console.log(entry.toString());
        }
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Tape: Tape
};
