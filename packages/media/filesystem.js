//
// File System
//

const { Device } = require('./device');

//-----------------------------------------------------------------------------------------------//
// Position
//-----------------------------------------------------------------------------------------------//

class Position {
    constructor(track, sector) {
        this._track = track || 0;
        this._sector = sector || 0;
    }

    get track() { return this._track; }
    get sector() { return this._sector; }

    clone() {
        return new Position(this._track, this._sector);
    }

    set(track, sector) {
        this._track = track;
        this._sector = sector;
    }

    nextSector(step) {
        if (null == step) step = FileSystem.SECTOR_INTERLEAVE;
        const nextPosition = this.clone();
        nextPosition.inc(step, true);
        return nextPosition;
    }

    inc(step, wrapDecrement) {
        if (null == step) step = 1;
        this._sector += step;
        const numSectors = FileSystem.getNumSectorsPerTrack(this._track);
        if (this._sector >= numSectors) {
            this._sector -= numSectors;
            if (wrapDecrement && step > 1 && this._sector > 0) this._sector--;
        }
    }

    static nextTrack(track, numTracks) {
        return (track < FileSystem.BAM_TRACK) ? (numTracks + 1 - track) : (numTracks - track);
    }

    incTrack(numTracks) {
        this._track = Position.nextTrack(this._track, numTracks);
    }
}

//-----------------------------------------------------------------------------------------------//
// File System
//-----------------------------------------------------------------------------------------------//

class FileSystem {
    static PETSCIIToChar(petscii) {
        let ascii = petscii;
        return String.fromCharCode(ascii);
    }

    static charToPETSCII(c) {
        let ascii = c.charCodeAt(0);
        let petscii = ascii;
        return petscii & 0xff;
    }

    static readPETSCII(data, ofs, len) {
        if (null == data || ofs >= data.length || len < 1) {
            return "";
        }

        let s = "";

        const end = ofs + len;
        while (ofs < end) {
            let petscii = data[ofs];
            if (petscii == 0xa0) break;
            s += FileSystem.PETSCIIToChar(petscii)
            ofs++;
        }

        return s;
    }

    static writePETSCII(s, data, ofs, len) {
        if (null == s || s.length < 1 || null == data || ofs + len >= data.length || len < 1) {
            return;
        }

        const end = ofs + len;

        let i=0;
        while (ofs < end && i < s.length) {
            data[ofs++] = FileSystem.charToPETSCII(s[i]);
            i++;
        }

        while (ofs < end) { // fill with $a0 (shift-space)
            data[ofs++] = 0xa0;
        }
    }

    static getNumSectorsPerTrack(track) {
        if (track <= 17) {
            return 21;
        } else if (track <= 24) {
            return 19;
        } else if (track <= 30) {
            return 18;
        } else {
            return 17;
        }
    }
}

FileSystem.SECTOR_INTERLEAVE = 10;
FileSystem.SECTOR_SIZE = 256;
FileSystem.BAM_TRACK = 18;
FileSystem.BAM_POSITION = new Position(18, 0);

//-----------------------------------------------------------------------------------------------//
// File
//-----------------------------------------------------------------------------------------------//

class File {
    constructor (name, type, flags, size, position, sidePosition, loadAddr=0x0) {
        this.#init();

        this._name = name;
        this._type = type;
        this._flags = flags;
        this._size = size;
        this._position = position || new Position();
        this._sidePosition = sidePosition || new Position();
        this._typeName = this.#getTypeName(type & 0xf);
        this._fsName = Device.getFsName(name);
        this._loadAddr = loadAddr
    }

    get name() { return this._name; }
    get type() { return this._type; }
    get flags() { return this._flags; }
    get size() { return this._size; }
    get typeName() { return this._typeName; }
    get locked() { return (this._flags & File.FLAG_LOCKED) != 0x0; }
    get closed() { return (this._flags & File.FLAG_CLOSED) != 0x0; }
    get position() { return this._position; }
    get sidePosition() { return this._sidePosition; }
    get fsName() { return this._fsName; }
    get loadAddr() { return this._loadAddr; }

    set type(t) { this._type = t; }
    set flags(f) { this._flags = f; }
    set name(n) {
        this._name = n;
        this._fsName = Device.getFsName(n);
    }

    toString() {
        const name = ("\"" + this.name + "\"                ").substring(0, 18);
        const sz = (this.size + "     ").substring(0, 5);
        const closedIndicator = this.closed ? " " : "*";
        const lockedIndicator = this.locked ? "<" : " ";
        return sz + name + closedIndicator + this.typeName + lockedIndicator;
    }

    #getTypeName(type) {
        let typeName = "";
        switch (type) {
            case File.TYPE_DEL: { typeName = "DEL"; break; }
            case File.TYPE_SEQ: { typeName = "SEQ"; break; }
            case File.TYPE_PRG: { typeName = "PRG"; break; }
            case File.TYPE_USR: { typeName = "USR"; break; }
            case File.TYPE_REL: { typeName = "REL"; break; }
            default: { break; }
        }
        return typeName;
    }

    #init() {
        this._name = null;
        this._type = File.TYPE_NONE;
        this._flags = File.FLAG_NONE;
        this._size = 0;
        this._typeName = "";
        this._position = null;
        this._sidePosition = null;
    }

    static decode(data, ofs) {

        if (null == data || data.length < ofs + 0x20) {
            return null;
        }

        const file_type = data[ofs+0x0];
        if (file_type == 0x0) return null;
        const position = new Position(data[ofs+0x1], data[ofs+0x2]);
        const sidePosition = new Position(data[ofs+0x13], data[ofs+0x14]);
        const file_size = data[ofs+0x1c] + data[ofs+0x1d] * FileSystem.SECTOR_SIZE;
        let filename = FileSystem.readPETSCII(data, ofs+0x3, 16);

        let file = new File(filename, file_type & 0x0f, file_type & 0xf0, file_size, position, sidePosition);

        return file;
    }

    static encode(file, data, ofs) {
        if (null == data || data.length < ofs + 0x20) {
            return;
        }

        FileSystem.writePETSCII(file.name, data, ofs+0x3, 16);

        data[ofs+0x0] = (file.type & 0x0f) | (file.closed ? File.FLAG_CLOSED : 0x0) | (file.locked ? File.FLAG_LOCKED : 0x0);
        data[ofs+0x1] = file.position.track & 0xff;
        data[ofs+0x2] = file.position.sector & 0xff;
        data[ofs+0x13] = file.sidePosition.track & 0xff;
        data[ofs+0x14] = file.sidePosition.sector & 0xff;
        data[ofs+0x1c] = file.size & 0xff;
        data[ofs+0x1d] = (file.size >> 8) & 0xff;
    }
}

File.TYPE_NONE = 0x0;
File.TYPE_DEL = 0x00;
File.TYPE_SEQ = 0x01;
File.TYPE_PRG = 0x02;
File.TYPE_USR = 0x03;
File.TYPE_REL = 0x04;

File.FLAG_NONE = 0x0;
File.FLAG_SAVE = 0x20;
File.FLAG_LOCKED = 0x40;
File.FLAG_CLOSED = 0x80;

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    File: File,
    Position: Position,
    FileSystem: FileSystem
};
