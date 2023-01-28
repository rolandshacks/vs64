//
// String Offset Table
//

const fs = require('fs');
const path = require('path');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { Logger } = require('utilities/logger');
const { Utils } = require('utilities/utils');

const { ElfSection } = require('elf/section');

const {
    ElfConstants,
    ElfLineInfoAttributes,
    ElfTagNames,
    ElfAttributeNames,
    ElfFormCodes,
    ElfSectionTypes
} = require('elf/types');

//-----------------------------------------------------------------------------------------------//
// Elf String Offset Table Section
//-----------------------------------------------------------------------------------------------//

class ElfStringOffsetTableSection extends ElfSection {
    constructor(sectionHeader) {
        super(sectionHeader);

        this._table = this.#decodeOffsetTable();
    }

    get(index) {
        const tab = this._table;
        if (!tab || index >= tab.length) return null;
        return tab[index];
    }

    #decodeOffsetTable() {

        const deserializer = this.getDeserializer();

        const unitHeader = deserializer.readUnitHeader();
        if (unitHeader.version != 5) {
            throw(".debug_line version != 5 is not supported");
        }

        const unit = {};
        unit.header = unitHeader;

        const padding = deserializer.read16();

        const offsets = [];

        while (deserializer.ofs < unitHeader.endOfs) {
            const offset = deserializer.readOffs();
            offsets.push(offset);
        }

        return offsets;
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    ElfStringOffsetTableSection: ElfStringOffsetTableSection
}
