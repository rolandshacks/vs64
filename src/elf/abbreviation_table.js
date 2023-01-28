//
// Abbreviation Table
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
// Elf Abbreviation Table Section
//-----------------------------------------------------------------------------------------------//

class ElfAbbreviationTableSection extends ElfSection {
    constructor(sectionHeader) {
        super(sectionHeader);
        this._abbreviations = null;
    }

    get(code) {
        if (!this._abbreviations) return null;
        return this._abbreviations.get(code);
    }

    resolve() {
        if (!super.resolve()) return;

        const deserializer = this.getDeserializer();
        const endOfs = deserializer.ofs + this._header.size;

        this._abbreviations = new Map();

        while (!deserializer.eof()) {
            if (deserializer.ofs >= endOfs) {
                break;
            }

            const abbreviation = {};

            abbreviation.code = deserializer.readULEB128();
            if (!abbreviation.code) {
                continue; // end of abbreviations for unit
            }

            abbreviation.tag = deserializer.readULEB128();
            abbreviation.hasChildren = (deserializer.read8() != 0x0);
            abbreviation.attributes = [];

            while (!deserializer.eof()) {
                if (deserializer.ofs >= endOfs) {
                    break;
                }

                const attribute = {};

                attribute.name = deserializer.readULEB128();
                if (!attribute.name) break;

                attribute.formCode = deserializer.readULEB128();
                if (!attribute.formCode) break; // last entry

                abbreviation.attributes.push(attribute);
            }

            this._abbreviations.set(abbreviation.code, abbreviation);

        }
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    ElfAbbreviationTableSection: ElfAbbreviationTableSection
}
