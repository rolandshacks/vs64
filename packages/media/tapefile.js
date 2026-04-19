//
// SID
//

const { MediaType, MediaClassId } = require("./mediatype");
const { MediaFile } = require("./mediafile");
const { Tape } = require('./tape');

class TapeMediaFile extends MediaFile {
    constructor(...args) {
        super(...args)

        this._mediaType = MediaType.TAPE;
        this._mediaClass = MediaType.classFromType(this._mediaType);
        this.tape = null;
    }

    static createInstance(...args) {
        return new TapeMediaFile(...args);
    }

    unpack() {

        const m = this;
        const tape = new Tape();
        tape.openFromBuffer(m.data);

        m.set("Type", "Tape File", null, true);
        m.set("Size", tape.size + " bytes");
        m.set("Name", tape.name);
        m.set("Version", tape.version);
        m.set("File Count", tape.directory.length);

        m.tape = tape;
    }
}

TapeMediaFile.ClassName = MediaClassId.TAPE;

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    TapeMediaFile: TapeMediaFile
};
