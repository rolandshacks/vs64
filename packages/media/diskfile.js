//
// Charset
//

const { MediaType, MediaClassId } = require("./mediatype");
const { MediaFile } = require("./mediafile");
const { Disk } = require('./disk');

/*
function hasBit(value, bit) {
    return (value & (1 << bit)) != 0x0;
}
*/

class DiskMediaFile extends MediaFile {
    constructor(...args) {
        super(...args)
        this._mediaType = MediaType.DISK;
        this._mediaClass = MediaType.classFromType(this._mediaType);
        this.disk = null;
    }

    static createInstance(...args) {
        return new DiskMediaFile(...args);
    }

    unpack() {
        const m = this;

        const disk = new Disk();
        disk.openFromBuffer(m.data);

        m.set("Type", "Disk File", null, true);
        m.set("Size", disk.size + " bytes");
        m.set("ID", disk.id || "empty");
        m.set("Name", disk.name || "empty");
        m.set("Tracks", disk.numTracks);
        m.set("Sectors", disk.numSectors);
        m.set("Version", disk.version);
        m.set("Format", disk.format);
        m.set("Double Sided", disk.doubleSided ? "yes" : "no");
        m.set("Error Info", (disk.errorInfo ? (disk.errorInfo.length + " bytes") : "no"));

        m.disk = disk;
    }
}

DiskMediaFile.ClassName = MediaClassId.DISK;

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    DiskMediaFile: DiskMediaFile
};
