//
// String Table
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { ElfSection } = require('elf/section');

//-----------------------------------------------------------------------------------------------//
// Elf String Table
//-----------------------------------------------------------------------------------------------//

class ElfStringTable extends ElfSection {
    constructor(sectionHeader) {
        super(sectionHeader);
    }

    get(ofs) {
        const buffer = this.buffer;
        const end = buffer.length;

        if (ofs < 0 || ofs >= end) {
            throw("string offset out of bounds");
        }

        let pos = ofs;
        let s = "";
        while (pos < end) {
            const c = buffer[pos];
            if (c == 0) break;
            s += String.fromCharCode(c);
            pos++;
        }
        return s;
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    ElfStringTable: ElfStringTable
}
