//
// Elf
//

const fs = require('fs');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { ElfConstants, ElfSectionTypes } = require('elf/types');
const { ElfDeserializer } = require('elf/deserializer');
const { ElfSection, ElfSectionHeader } = require('elf/section');
const { ElfStringTable } = require('elf/string_table');
const { ElfSymbolTable, ElfSymbol } = require('elf/symbol_table');
const { ElfDebugLineSection } = require('elf/debug_line');
const { ElfAbbreviationTableSection } = require('elf/abbreviation_table');
const { ElfAddressTableSection } = require('elf/address_table');
const { ElfStringOffsetTableSection } = require('elf/string_offset_table');
const { ElfDebugInfoSection } = require('elf/debug_info');

//-----------------------------------------------------------------------------------------------//
// Elf
//-----------------------------------------------------------------------------------------------//
class Elf {
    constructor() {
        this.#initialize();
    }

    get header() { return this._header; }
    get format() { return this._header.format; }
    get sections() { return this._sections; }
    get buffer() { return this._buffer; }

    load(filename) {
        this.#initialize();
        this._buffer = fs.readFileSync(filename);
        this.#parse();
    }

    getSection(name) {
        if (!this._sectionMap) return null;

        const section = this._sectionMap.get(name);

        if (section && !section.isResolved()) {
            section.resolve();
        }

        return section;

    }

    #initialize() {
        this._buffer = null;
        this._deserializer = null;
        this._header = null;
        this._sections = null;
        this._sectionMap = null;
    }

    #parse() {
        this._deserializer = new ElfDeserializer(this._buffer);
        this._deserializer.setMsb();

        this.#parseHeader();
        this.#parseSectionHeaders();
    }

    #parseHeader() {
        const deserializer = this._deserializer;

        deserializer.reset();
        this._header = ElfHeader.fromStream(deserializer);
    }

    #parseSectionHeaders() {
        const elf = this;
        const elfHeader = elf.header;

        const deserializer = this._deserializer;

        const sections = [];
        const sectionMap = new Map();

        let nameSection = null;

        const sectionHeaders = [];

        const numSections = elfHeader.sectionHeaderEntryCount;
        for (let sectionIndex=0; sectionIndex<numSections; sectionIndex++) {
            deserializer.setOffset(elfHeader.sectionHeaderAddr + sectionIndex * elfHeader.sectionHeaderEntrySize);
            const sectionHeader = ElfSectionHeader.fromStream(deserializer, elf, sectionIndex);
            sectionHeaders.push(sectionHeader);
            if (sectionIndex == elfHeader.sectionNameEntryIndex) {
                nameSection = ElfSectionFactory.createInstance(sectionHeader);
            }
        }

        for (const sectionHeader of sectionHeaders) {

            const sectionIndex = sectionHeader.index;

            if (nameSection && sectionHeader.nameOfs) {
                sectionHeader.setName(nameSection.get(sectionHeader.nameOfs));
            }

            let section = null;
            if (sectionIndex == elfHeader.sectionNameEntryIndex) {
                section = nameSection;
            } else {
                section = ElfSectionFactory.createInstance(sectionHeader);
            }

            sections.push(section);
            if (section.name) sectionMap.set(section.name, section);
        }

        this._sections = sections;
        this._sectionMap = sectionMap;
    }

    #resolveSections() {
        const sections = this._sections;
        for (const section of sections) {
            section.resolve();
        }
    }
}


//-----------------------------------------------------------------------------------------------//
// Elf Header
//-----------------------------------------------------------------------------------------------//

class ElfHeader {
    constructor(buffer) {
        this._buffer = buffer;
    }

    get buffer() { return this._buffer; }

    #deserialize(deserializer) {

        ///// IDENTIFICATION BLOCK

        const magic = deserializer.read32();
        if (magic != ElfConstants.MagicNumber) throw ("invalid ELF file format");

        this.format = deserializer.read8(); // Elf Format (1: 32bit, 2: 64bit)

        deserializer.setFormat(this.format);

        this.endianness = deserializer.read8();
        if (ElfConstants.LittleEndian == this.endianness) deserializer.setLsb(); else deserializer.setMsb();

        this.version = deserializer.read8(); // 1 = original version of ELF
        if (1 != this.version) throw ("invalid ELF file format");

        this.abi = deserializer.read8();
        this.abiVersion = deserializer.read8();

        deserializer.skip(7); // padding

        ///// HEADER BLOCK

        this.fileType = deserializer.read16(); // 1 = relocatable file, 2 = executable file, 3 = shared object file, 4 = core file
        this.machine = deserializer.read16();  // 62 = AMD x86-64 architecture, 3 = EM_386

        const elfVersion = deserializer.read32(); // 1 = original version of ELF
        if (1 != elfVersion) throw ("invalid ELF file format");

        this.programStartAddr = deserializer.readAddr();
        this.programHeaderAddr = deserializer.readAddr();
        this.sectionHeaderAddr = deserializer.readAddr();
        this.architectureFlags = deserializer.read32();
        this.elfHeaderSize = deserializer.read16();
        this.programHeaderEntrySize = deserializer.read16();
        this.programHeaderEntryCount = deserializer.read16();
        this.sectionHeaderEntrySize = deserializer.read16();
        this.sectionHeaderEntryCount = deserializer.read16();
        this.sectionNameEntryIndex = deserializer.read16();
    }

    static fromStream(deserializer) {
        const buffer = deserializer.buffer;
        const elfHeader = new ElfHeader(buffer);
        elfHeader.#deserialize(deserializer);
        return elfHeader;
    }

}

//-----------------------------------------------------------------------------------------------//
// Elf Section Factory
//-----------------------------------------------------------------------------------------------//

class ElfSectionFactory {
    static createInstance(sectionHeader) {

        const sectionType = sectionHeader.type;
        const sectionName = sectionHeader.name;

        let elfSection = null;

        if (sectionType == ElfSectionTypes.StringTable) {
            elfSection = new ElfStringTable(sectionHeader);
        } else if (sectionType == ElfSectionTypes.SymbolTable) {
            elfSection = new ElfSymbolTable(sectionHeader);
        } else if (sectionName == ".debug_line") {
            elfSection = new ElfDebugLineSection(sectionHeader);
        } else if (sectionName == ".debug_line_str") {
            elfSection = new ElfStringTable(sectionHeader);
        } else if (sectionName == ".debug_str") {
            elfSection = new ElfStringTable(sectionHeader);
        } else if (sectionName == ".debug_addr") {
            elfSection = new ElfAddressTableSection(sectionHeader);
        } else if (sectionName == ".debug_str_offsets") {
            elfSection = new ElfStringOffsetTableSection(sectionHeader);
        } else if (sectionName == ".debug_abbrev") {
            elfSection = new ElfAbbreviationTableSection(sectionHeader);
        } else if (sectionName == ".debug_info") {
            elfSection = new ElfDebugInfoSection(sectionHeader);
        } else {
            elfSection = new ElfSection(sectionHeader);
        }

        return elfSection;
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Elf: Elf,
    ElfSymbol: ElfSymbol
}
