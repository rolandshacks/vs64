//
// Address Table
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
// Elf Address Table Section
//-----------------------------------------------------------------------------------------------//

class ElfAddressTableSection extends ElfSection {
    constructor(sectionHeader) {
        super(sectionHeader);
        this._addressTable = this.#decodeAddressTable();
    }

    get(index) {
        const addr = this._addressTable;
        if (!addr || index >= addr.length) return null;
        return addr[index].address;
    }

    #decodeAddressTable() {

        const deserializer = this.getDeserializer();

        const unitHeader = deserializer.readUnitHeader();
        if (unitHeader.version != 5) {
            throw(".debug_line version != 5 is not supported");
        }

        const unit = {};
        unit.header = unitHeader;
        deserializer.setFormat(unitHeader.format);

        unitHeader.addressSize = deserializer.read8();
        unitHeader.segmentSelectorSize = deserializer.read8();

        const entries = [];

        while (deserializer.ofs < unitHeader.endOfs) {

            const entry = {};

            if (unitHeader.segmentSelectorSize > 0) {
                entry.segment = deserializer.read(unitHeader.segmentSelectorSize);
            }

            entry.address = deserializer.read(unitHeader.addressSize);

            entries.push(entry);
        }

        return entries;
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    ElfAddressTableSection: ElfAddressTableSection
}
