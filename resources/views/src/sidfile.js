/**
 * SID Media File
 * @module Web
 */

import { MediaFile } from "./mediafile.js";
import { Factory } from "./factory.js";

const SID_MEDIA_FILE_CLASSNAME = "media.sid";

class SidFile extends MediaFile {
    constructor(...args) {
        super(...args)
    }

    static createInstance(...args) {
        return new SidFile(...args);
    }

    unpack() {
        const reader = this.getReader();

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
        const dataOffset = reader.readInt(2);
        const dataSize = fileSize - (dataOffset + 2);

        let loadAddress = reader.readInt(2);
        if (loadAddress == 0x0) {
            loadAddress = reader.readByteAt(dataOffset) + reader.readByteAt(dataOffset+1) * 256;
        }
        m.set("Load Address", "0x" + loadAddress.toString(16));

        m.set("Init Address", "0x" + reader.readInt(2).toString(16));
        m.set("Play Address", "0x" + reader.readInt(2).toString(16));
        m.set("Num Songs", reader.readInt(2));
        m.set("Start Song", reader.readInt(2));
        m.set("Speed", reader.readInt(4));

        m.set("Title", reader.readChars(32), null, true);
        m.set("Author", reader.readChars(32), null, true);
        m.set("Released", reader.readChars(32), null, true);

        let flags = 0;
        if (version != 1) {
            flags = reader.readInt(2);
        }

        m.set("Player", (flags & 0x1) ? "built-in music player" : "Compute!'s Sidplayer MUS data");
        m.set("Compatibility", (flags & 0x2) ? "C64 compatible" : "PlaySID specific (PSID v2NG, v3, v4) / C64 BASIC flag (RSID)");

        let norm = "";
        if ((flags & 0x4) && (flags & 0x8)) norm = "PAL and NTSC";
        else if (flags & 0x4) norm = "PAL";
        else if (flags & 0x8) norm = "NTSC";
        m.set("Norm", norm);
    }
}

SidFile.ClassName = SID_MEDIA_FILE_CLASSNAME;

Factory.register(SidFile);

export {
    SidFile as SidFile
};
