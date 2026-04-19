//
// SID
//

const { MediaType, MediaClassId } = require("./mediatype");
const { MediaFile } = require("./mediafile");

class SidMediaFile extends MediaFile {
    constructor(...args) {
        super(...args)

        this._mediaType = MediaType.SID;
        this._mediaClass = MediaType.classFromType(this._mediaType);

        this._dataOffset = 0x0;
        this._dataSize = 0x0;
        this._loadAddress = 0x0;
        this._initAddress = 0x0;
        this._playAddress = 0x0;
        this._numSongs = 0;
        this._startSong = 0;
        this._speed = 0;
    }

    static createInstance(...args) {
        return new SidMediaFile(...args);
    }

    readSync(_addr) {
        return 0x0;
    }

    writeSync(_addr) {
        return 0x0;
    }

    unpack() {
        const reader = this.getReader();

        reader.littleEndian = false;

        const fileSize = reader.avail;
        if (fileSize < 126) {
            throw("invalid sid file size");
        }

        const magic = reader.readChars(4);
        if (magic != "PSID" && magic != "RSID") {
            throw("invalid file magic bytes: " + magic);
        }

        const m = this;

        m.set("Type", "SID Music File", null, true);
        m.set("Size", fileSize + " bytes");

        const version = reader.readInt(2);
        m.set("Version", version);
        let dataOffset = reader.readInt(2);
        let dataSize = fileSize - dataOffset;

        this._loadAddress = reader.readInt(2);
        if (this._loadAddress == 0x0) {
            this._loadAddress = reader.readByteAt(dataOffset) + reader.readByteAt(dataOffset+1) * 256;
            dataOffset += 2;
            dataSize -= 2;
        }
        m.set("Load Address", "0x" + this._loadAddress.toString(16));

        this._dataOffset = dataOffset;
        this._dataSize = dataSize;

        this._initAddress = reader.readInt(2);
        m.set("Init Address", "0x" + this._initAddress.toString(16));

        this._playAddress = reader.readInt(2);
        m.set("Play Address", "0x" + this._playAddress.toString(16));

        this._numSongs = reader.readInt(2)
        m.set("Num Songs", this._numSongs);

        this._startSong = reader.readInt(2);
        m.set("Start Song", this._startSong);

        this._speed = reader.readInt(4);
        m.set("Speed", this._speed);

        m.set("Title", reader.readChars(32), null, true);
        m.set("Author", reader.readChars(32), null, true);
        m.set("Released", reader.readChars(32), null, true);

        let flags = 0;
        if (version != 1) {
            flags = reader.readInt(2);
        }

        m.set("Player", (flags & 0x1) ? "built-in music player" : "Compute!'s Sidplayer MUS data");
        m.set("Compatibility", (flags & 0x2) ? "C64 compatible" : "PlaySID specific (PSID v2NG, v3, v4) / C64 BASIC flag (RSID)");

        let norm = "unknown";
        if ((flags & 0x4) && (flags & 0x8)) norm = "PAL and NTSC";
        else if (flags & 0x4) norm = "PAL";
        else if (flags & 0x8) norm = "NTSC";
        m.set("Norm", norm);
    }
}

SidMediaFile.ClassName = MediaClassId.SID;

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    SidMediaFile: SidMediaFile
};
