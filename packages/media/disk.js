//
// Disk
//

const { Device } = require('./device');
const { FileSystem, Position, File } = require('./filesystem');

//-----------------------------------------------------------------------------------------------//
// Helpers
//-----------------------------------------------------------------------------------------------//

function clamp(a, b, c) {
    if (a < b) return b;
    if (a > c) return c;
    return a;
}

function countBits(a) {
    let count = 0;
    while (a > 0) {
        if (a & 0x1) count++;
        a >>= 1;
    }
    return count;
}

//-----------------------------------------------------------------------------------------------//
// Virtual Disk
//-----------------------------------------------------------------------------------------------//

class Disk extends Device {
    constructor(filename, filesystemIO=null) {
        super(filename, filesystemIO);
        this._deviceType = Device.DEVICE_TYPE_DISK;
    }

    init() {
        super.init();
        this._errorInfo = null;
        this._directory = null;
        this._id = null;
        this._format = null;
        this._doubleSided = null;
        this._diskType = Disk.TYPE_UNKNOWN;
    }

    get type() { return this._diskType; }
    get image() { return this._buffer; }
    get filename() { return this._filename || ""; }
    get errorInfo() { return this._errorInfo; }
    get numTracks() { return this._numTracks; }
    get numSectors() { return this._numSectors; }

    get id() { return this._id || ""; }
    get format() { return this._format || ""; }
    get doubleSided() { return (this._doubleSided == 0x80); }

    flush() {
        this.write(null);
    }

    create(name, id, numTracks, addErrorInfo) {

        this.close();

        this._filename = "unnamed.d64";
        this._name = name;
        this._id = id;
        this._format = "A"; // default
        this._version = "2"; // default version 2 (DOS)
        this._doubleSided = 0x0; // single sided

        // utilize the fact that size is encoded in the type id

        if (null == numTracks) numTracks = 35;

        let diskType = 0;

        if (numTracks == 35) {
            diskType = (addErrorInfo != true) ? Disk.TYPE_35 : Disk.TYPE_35_ERR;
        } else if (numTracks == 40) {
            diskType = (addErrorInfo != true) ? Disk.TYPE_40 : Disk.TYPE_40_ERR;
        } else if (numTracks == 42) {
            diskType = (addErrorInfo != true) ? Disk.TYPE_42 : Disk.TYPE_42_ERR;
        } else {
            throw new Error("invalid disk format parameters");
        }

        const metrics = Disk.#getMetrics(diskType);
        this._numTracks = metrics.numTracks;
        this._numSectors = metrics.numSectors;
        this._size = metrics.size;
        this._diskType = metrics.type;

        this._buffer = new Uint8Array(this._size);

        if (metrics.hasErrorInfo) {
            const ofs = this._size - this._numSectors
            this._errorInfo = this._buffer.subarray(ofs);
        }

        this.#writeBAM(true);
        this.writeDirectory();
    }

    static #getMetrics(type) {

        let numTracks = 0;
        let numSectors = 0;
        let hasErrorInfo = false;

        switch (type) {
            case Disk.TYPE_35: {
                numTracks = 35;
                numSectors = 683;
                break;
            }
            case Disk.TYPE_35_ERR: {
                numTracks = 35;
                numSectors = 683;
                hasErrorInfo = true;
                break;
            }
            case Disk.TYPE_40: {
                numTracks = 40;
                numSectors = 768;
                break;
            }
            case Disk.TYPE_40_ERR: {
                numTracks = 40;
                numSectors = 768;
                hasErrorInfo = true;
                break;
            }
            case Disk.TYPE_42: {
                numTracks = 42;
                numSectors = 802;
                break;
            }
            case Disk.TYPE_42_ERR: {
                numTracks = 42;
                numSectors = 802;
                hasErrorInfo = true;
                break;
            }
            default: {
                throw new Error("unsupported disk format");
            }
        }

        return {
            type: type,
            size: type, // disk type is the size
            numTracks: numTracks,
            numSectors: numSectors,
            hasErrorInfo: hasErrorInfo
        };
    }

    fromRawBuffer(buffer) {
        if (null == buffer || buffer.length < 1) {
            throw new Error("invalid disk data");
        }

        this._buffer = buffer;
        this._size = this._buffer.length;
        this._diskType = this._size; // use size bytes as type id

        const metrics = Disk.#getMetrics(this._diskType);
        this._numTracks = metrics.numTracks;
        this._numSectors = metrics.numSectors;

        if (metrics.hasErrorInfo) {
            const ofs = this._size - this._numSectors
            this._errorInfo = this._buffer.subarray(ofs);
        }

        this.#readBAM();
        this.readDirectory();

    }

    renameFile(name, newName) {
        if (name == null || name.length < 1) {
            throw new Error("invalid arguments");
        }

        for (let entry of this.directory) {
            if (name == entry.name) {
                entry.name = newName;
                this.writeDirectory();
                return entry;
            }
        }

        return null;
    }

    readFile(name) {
        const file = this.seekFile(name);
        if (null == file) {
            throw new Error("file not found: " + name);
        }

        const position = file.position.clone();
        const chunks = [];
        let readSize = 0;

        while (true) {
            const sector = this.readSector(position);
            position.set(sector[0x0], sector[0x1]);
            const len = Math.max(0,((position.track != 0x0) ? FileSystem.SECTOR_SIZE : position.sector) - 2);
            chunks.push(sector.subarray(2, 2+len));
            readSize += len;
            if (position.track == 0x0) break; // reached last sector / EOF
        }

        const buffer = new Uint8Array(readSize);
        let ofs = 0;

        for (const chunk of chunks) {
            buffer.set(chunk, ofs, chunk.length);
            ofs += chunk.length;
        }

        return buffer;
    }

    #getFileSectors(name) {
        if (name == null || name.length < 1) {
            throw new Error("invalid arguments");
        }

        const file = this.seekFile(name);
        if (null == file) {
            throw new Error("file not found: " + name);
        }

        const position = file.position;

        const sectors = [];
        while (true) {
            sectors.push(position.clone());
            const sector = this.readSector(position);
            position.set(sector[0x0], sector[0x1]);
            if (position.track == 0x0) break; // reached last sector / EOF
        }

        return sectors;
    }

    deleteFile(name) {

        const bam = this.getBam();

        // mark sectors as free
        const positions = this.#getFileSectors(name);
        for (const position of positions) {
            bam.markSector(position, false);
        }

        // mark as deleted type
        for (let entry of this.directory) {
            if (name == entry.name) {
                entry.type = File.TYPE_DEL;
                entry.flags = File.FLAG_NONE;
                break;
            }
        }

        // remove from directory
        //const remaining = this._directory.filter((file) => { return file.name != name; });
        //this._directory = remaining;

        this.writeDirectory();
    }

    writeFile(name, type, buffer, overwrite) {
        if (name == null || name.length < 1 || buffer == null) {
            throw new Error("invalid arguments");
        }

        if (null == type) {
            const pos = name.lastIndexOf('.');
            const ext = (pos != -1) ? name.substring(pos+1).toLowerCase() : "";
            if (ext == "prg") type = File.TYPE_PRG;
            else if (ext == "seq") type = File.TYPE_SEQ;
            else if (ext == "rel") type = File.TYPE_REL;
            else type = File.TYPE_USR;
        }

        const existingFile = this.seekFile(name);
        if (null != existingFile) {
            if (overwrite) {
                this.deleteFile(name);
            } else {
                throw new Error("file already exists");
            }
        }

        // make a backup copy of BAM sector
        const bamBackup = new Uint8Array(this.readSector(FileSystem.BAM_POSITION));

        const numSectors = Math.floor((buffer.length + FileSystem.SECTOR_SIZE - 1) / FileSystem.SECTOR_SIZE);
        const bam = this.getBam();

        let bytesToWrite = buffer.length;
        let read_ofs = 0;

        let position = null;
        let startPosition = null;

        while (bytesToWrite > 0) {

            const previousPosition = position;

            position = this.#findFreeSector(position);
            if (null == position) {
                // restore BAM, roll-back invalid file entries
                this.writeSector(FileSystem.BAM_POSITION, bamBackup);
                throw(new Error("disk full"));
            }

            if (null == startPosition) {
                startPosition = position.clone();
            }

            if (null != previousPosition) {
                this.#write(previousPosition, 0, null, new Uint8Array([position.track, position.sector]));
            }

            let len = Math.min(FileSystem.SECTOR_SIZE-2, bytesToWrite);
            const chunk = buffer.subarray(read_ofs, read_ofs + len);

            bytesToWrite -= len;
            read_ofs += len;

            if (bytesToWrite < 1) {
                // last sector, write track $00, and usage of sector
                this.#write(position, 0, null, new Uint8Array([0x0, (len + 2) & 0xff]));
            }

            this.#write(position, 2, null, chunk);

            bam.markSector(position);

            //console.log("" + position.track + "/" + position.sector + " - " + chunk.length + " bytes written");
        }

        // finally, add to directory
        const file = new File(name, type, File.FLAG_CLOSED, numSectors, startPosition);
        this.addDirectoryEntry(file);

        this.writeDirectory();
    }

    storeFile(filename, name, type, overwrite) {

        if (filename == null || filename.length < 1 || name == null || name.length < 1) {
            throw new Error("invalid arguments");
        }

        if (null == type) {
            const pos = filename.lastIndexOf('.');
            const ext = (pos != -1) ? filename.substring(pos+1).toLowerCase() : "";
            if (ext == "prg") type = File.TYPE_PRG;
            else if (ext == "seq") type = File.TYPE_SEQ;
            else if (ext == "rel") type = File.TYPE_REL;
            else type = File.TYPE_USR;
        }

        let buffer = null;

        try {
            buffer = this._io.readFile(filename);
        } catch (_err) {
            throw new Error("failed to open file '" + filename + "'");
        }

        this.writeFile(name, type, buffer, overwrite);
    }

    getBam() {
        const data = this.readSector(FileSystem.BAM_POSITION);
        if (null == data || data.length < FileSystem.SECTOR_SIZE) {
            throw new Error("corrupted BAM area");
        }

        return new Bam(data);
    }

    #findFreeSector(startPosition) {
        const bam = this.getBam();
        const position = startPosition != null ? startPosition.nextSector() : new Position(FileSystem.BAM_TRACK - 1, 0);
        while (position.track > 0 && position.track <= this.numTracks) {
            if (bam.getTrackFreeSectors(position.track) > 0) {
                while (true) {
                    if (!bam.getSectorStatus(position)) {
                        return position;
                    }
                    position.inc();
                }
            }
            position.incTrack(this.numTracks);
        }

        return null;
    }

    write(filename) {
        if (null == filename) filename = (this._filename || "unnamed.d64");

        const buffer = this._buffer;
        if (null == buffer || buffer.length < 1) {
            throw new Error("invalid disk data");
        }

        this.#writeBAM();
        this.writeDirectory();

        try {
            this._io.writeFile(filename, buffer, 'binary');
        } catch (_err) {
            throw new Error("failed to write disk file '" + filename + "'");
        }

    }

    readSector(position) {
        const ofs = Disk.getTrackOffset(position.track) + position.sector * FileSystem.SECTOR_SIZE;
        const len = FileSystem.SECTOR_SIZE;
        return super.readChunk(ofs, len);
    }

    writeSector(position, data) {
        const ofs = Disk.getTrackOffset(position.track) + position.sector * FileSystem.SECTOR_SIZE;
        const len = FileSystem.SECTOR_SIZE;
        return super.writeChunk(ofs, len, data);
    }

    #write(position, ofs, len, data) {
        if (null == data || data.length < 1) return;
        if (null == ofs) ofs = 0;
        if (null == len) len = data.length;
        ofs += Disk.getTrackOffset(position.track) + position.sector * FileSystem.SECTOR_SIZE;
        super.writeChunk(ofs, len, data);
    }

    readSectorAbsolute(sector, count) {
        if (!this.is_open || sector < 0 || sector >= this._numSectors) return null;
        if (!count) count = 1;
        if (sector + count > this._numSectors) return null;
        const ofs = sector * FileSystem.SECTOR_SIZE;
        const len = FileSystem.SECTOR_SIZE * count;
        return super.readChunk(ofs, len);
    }

    #readBAM() {
        const data = this.readSector(FileSystem.BAM_POSITION);
        if (null == data || data.length < FileSystem.SECTOR_SIZE) {
            throw new Error("corrupted BAM area");
        }

        this._format = FileSystem.PETSCIIToChar(data[0x02]);
        this._doubleSided = data[0x03];
        this._version = FileSystem.PETSCIIToChar(data[0xa5]);
        this._id = FileSystem.readPETSCII(data, 0xa2, 5);
        this._mode = data[0xab]; // 0x0 if standard 1541 mode
        this._name = FileSystem.readPETSCII(data, 0x90, 16);
    }

    #writeBAM(initBam) {
        const data = this.readSector(FileSystem.BAM_POSITION);
        if (null == data || data.length < FileSystem.SECTOR_SIZE) {
            throw new Error("corrupted BAM area");
        }

        data[0x02] = FileSystem.charToPETSCII(this._format);
        data[0x03] = this._doubleSided & 0xff;
        data[0xa5] = FileSystem.charToPETSCII(this._version);
        FileSystem.writePETSCII(this._id, data, 0xa2, 5);
        data[0xab] = this._mode & 0xff;
        FileSystem.writePETSCII(this._name, data, 0x90, 16);

        const bam = new Bam(data);

        if (initBam) {
            bam.init(this.numTracks);
        }

        bam.markSector(FileSystem.BAM_POSITION, true);

        this.writeSector(FileSystem.BAM_POSITION, data);
    }

    toString() {
        return (this.doubleSided ? "1" : "0") + " \"" + (this.name + "                ").substring(0, 16) + "\" " + this.id;
    }

    readDirectory() {

        const position = new Position(FileSystem.BAM_TRACK, Disk.DIR_SECTOR);

        for (let i=0; i<19; i++) { // max 19 sectors

            if (position.track == 0) break; // end of directory sectors

            const data = this.readSector(position);
            if (null == data || data.length < FileSystem.SECTOR_SIZE) {
                throw new Error("corrupted directory area");
            }

            // link to next directory track/sector
            position.set(data[0x0], data[0x1]);

            let ofs = 0x2;

            while (ofs <= 0xff) {
                const file = File.decode(data, ofs);
                if (null != file) {
                    this.addDirectoryEntry(file);
                }
                ofs += 0x20;
            }
        }
    }

    writeDirectory() {

        const bamSector = this.readSector(FileSystem.BAM_POSITION);
        if (null == bamSector || bamSector.length < FileSystem.SECTOR_SIZE) {
            throw new Error("corrupted BAM area");
        }

        const bam = new Bam(bamSector);

        const position = new Position(FileSystem.BAM_TRACK, Disk.DIR_SECTOR);

        // mark first directory sector as used
        bam.markSector(position, true);

        // initialize default sector chain from bam to first directory sector
        bamSector[0x0] = position.track;     // start track entry of directory chain
        bamSector[0x1] = position.sector;    // start sector entry of directory chain

        // initialize empty directory sector and terminate sector chain
        this.#write(position, 0, 2, new Uint8Array([0x0, 0xff]));

        ///
        /// ATTENTION: Multi-sector directories are currently not supported!!
        ///

        let sector_max = 18; // 19 sectors (max of track 18) - 1 BAM sector
        let sector_count = 0;
        let idx = 0;
        const directory = this.directory;
        while (idx < directory.length && sector_count < sector_max) {

            const buffer = new Uint8Array(FileSystem.SECTOR_SIZE);

            sector_count++;
            bam.markSector(position, true);

            buffer[0x0] = 0x0;  // no next, end of directory chain
            buffer[0x1] = 0xff; // no next, end of directory chain

            let ofs = 0x2;
            while (idx < directory.length && ofs <= 0xff) {
                const file = directory[idx];
                if (null == file) break;
                File.encode(file, buffer, ofs);
                idx++;
                ofs += 0x20;
            }

            this.writeSector(position, buffer);

            position.inc(Disk.DIR_SECTOR_INTERLEAVE);
            if (position.sector <= 1) break; // track overflow
        }

    }

    checkSector(sector) {
        const errorCode = this.getSectorErrorCode(sector);
        return (errorCode == Disk.ERR_UNKNOWN || errorCode == Disk.ERR_NO_ERROR);
    }

    getSectorErrorCode(sector) {
        if (!this.errorInfo || sector < 0 || sector >= this.errorInfo.length) return 0x0;
        return this.errorInfo[sector];
    }

    static getSectorOffset(track, sector) {
        let startSector = 0;
        startSector += clamp(track-1, 0, 17) * 21;
        startSector += clamp(track-18, 0, 7) * 19;
        startSector += clamp(track-25, 0, 6) * 18;
        startSector += clamp(track-31, 0, 99) * 17;
        if (null != sector) startSector += sector;
        return startSector;
    }

    static getTrackOffset(track) {
        let startSector = Disk.getSectorOffset(track, 0);
        return startSector * FileSystem.SECTOR_SIZE;
    }

    static getNumSectorsPerTrack(track) {
        return FileSystem.getNumSectorsPerTrack(track);
    }

    static getTrackLength(track) {
        return Disk.getNumSectorsPerTrack(track) * FileSystem.SECTOR_SIZE;
    }

    showStats() {
        console.log("--------- DISK INFO ---------");
        console.log("File: " + (this.filename || "no filename"));
        console.log("Name: \"" + this.name + "\"");
        console.log("Id: \"" + this.id + "\"");
        console.log("Tracks: " + this.numTracks);
        console.log("Sectors: " + this.numSectors);
        console.log("Format: " + this.format);
        console.log("Version: " + this.version);
        console.log("Double-sided: " + this.doubleSided);
        console.log("Error Info: " + (this.errorInfo ? (this.errorInfo.length + " bytes") : "no"));

        console.log("--------- DIRECTORY ----------");
        for (const entry of this.directory) {
            console.log(entry.toString());
        }
    }
}

Disk.DIR_SECTOR = 1; // on BAM track, sector 1
Disk.DIR_SECTOR_INTERLEAVE = 3; // interleave of dir sector writes
Disk.RESERVED_TRACK = FileSystem.BAM_TRACK;
Disk.RESERVED_SECTORS = 19;

Disk.TYPE_UNKNOWN = 0;
Disk.TYPE_35 = 174848;
Disk.TYPE_35_ERR = 175531;
Disk.TYPE_40 = 196608;
Disk.TYPE_40_ERR = 197376;
Disk.TYPE_42 = 205312;
Disk.TYPE_42_ERR = 206114;

Disk.ERR_UNKNOWN = 0x0;
Disk.ERR_NO_ERROR = 0x1;
Disk.ERR_HEADER_NOT_FOUND = 0x2;
Disk.ERR_SYNC_NOT_FOUND = 0x3;
Disk.ERR_DATA_DESCRIPTOR_NOT_FOUND = 0x4;
Disk.ERR_CHECKSUM_ERROR = 0x5;
Disk.ERR_WRITE_TEST_ERROR = 0x6;
Disk.ERR_WRITE_VERIFICATION_ERROR = 0x7;
Disk.ERR_WRITE_PROTECTION_ERROR = 0x8;
Disk.ERR_HEADER_CHECKSUM_ERROR = 0x9;
Disk.ERR_WRITE_ERROR = 0xa;
Disk.ERR_WRITE_SECTOR_ID_MISMATCH = 0xb;
Disk.ERR_DRIVE_NOT_READY = 0xf;

Disk.EMPTY_SECTOR = new Uint8Array(FileSystem.SECTOR_SIZE);


//-----------------------------------------------------------------------------------------------//
// BAM
//-----------------------------------------------------------------------------------------------//

class Bam {
    constructor(sectorData) {
        this._sector = sectorData;
    }

    #getData() { return this._sector; }

    init(numTracks) {
        for (let track=1; track<=numTracks; track++) {
            const sectorsPerTrack = Disk.getNumSectorsPerTrack(track);
            const freeSectors = sectorsPerTrack;
            const freeMap = (1 << sectorsPerTrack) - 1;
            this.#writeTrackInfo(track, freeSectors, freeMap);
        }
    }

    getFreeSectors(numTracks) {
        let freeSectors = 0;
        for (let track=1; track<=numTracks; track++) {
            freeSectors += this.getTrackFreeSectors(track);
        }
        return freeSectors;
    }

    getTrackSectors(track) {
        return Disk.getNumSectorsPerTrack(track);
    }

    getTrackFreeSectors(track) {
        const status = this.getTrackStatus(track);
        return status[0];
    }

    getTrackStatus(track) {
        return this.#readTrackInfo(track);
    }

    getSectorStatus(position) {
        const [ _freeSectors, freeMap ] = this.#readTrackInfo(position.track);
        const mask = Bam.#getSectorMask(position);
        return (freeMap & mask) == 0x0;
    }

    markSector(position, used) {
        let [ freeSectors, freeMap ] = this.#readTrackInfo(position.track);
        const mask = Bam.#getSectorMask(position);
        if (used != false) {
            freeMap &= (~mask);
        } else {
            freeMap |= mask;
        }
        freeSectors = countBits(freeMap);
        this.#writeTrackInfo(position.track, freeSectors, freeMap);
    }

    #readTrackInfo(track) {
        const ofs = Bam.#getTrackOffset(track);
        const data = this.#getData();
        const freeSectors = data[ofs+0];
        const freeMap = data[ofs+1] + (data[ofs+2]<<8) + (data[ofs+3]<<16);
        return [ freeSectors, freeMap ];
    }

    #writeTrackInfo(track, freeSectors, freeMap) {
        const ofs = Bam.#getTrackOffset(track);
        const data = this.#getData();
        data[ofs+0] = freeSectors & 0xff;
        data[ofs+1] = (freeMap & 0xff);
        data[ofs+2] = ((freeMap >> 8) & 0xff);
        data[ofs+3] = ((freeMap >> 16) & 0xff);
    }

    static #getTrackOffset(track) {
        return 0x04 + (track-1) * 4; // 4 bytes per track
    }

    static #getSectorMask(position) {
        //const sectorsPerTrack = Disk.getNumSectorsPerTrack(position.track);
        const bit = position.sector;
        const mask = (1 << bit);
        return mask;
    }

    static toString(track, freeSectors, freeMap) {
        let t = "" + track;
        if (t.length < 2) t = "0" + t;
        return "track " + t + " : " + freeSectors + " " + freeMap.toString(2);
    }

    dump() {
        for (let track=1; track<=35; track++) {
            const [ freeSectors, freeMap ] = this.getTrackStatus(track);
            console.log(Bam.toString(track, freeSectors, freeMap));
        }
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Disk: Disk
};
