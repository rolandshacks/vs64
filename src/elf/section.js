//
// Elf Section
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { ElfSectionTypes } = require('elf/types');
const { ElfDeserializer } = require('elf/deserializer');

//-----------------------------------------------------------------------------------------------//
// Elf Section Header
//-----------------------------------------------------------------------------------------------//

class ElfSectionHeader {
    constructor(index) {
        this._index = index;
        this._elf = null;
        this._name = null;
    }

    get elf() { return this._elf; }
    get index() { return this._index; }
    get name() { return this._name; }

    setName(name) { this._name = name; }

    #deserialize(deserializer, elf) {

        this._elf = elf;

        this.nameOfs = deserializer.read32();
        this.type = deserializer.read32();
        this.attributes = deserializer.readSize();

        this.addr = deserializer.readAddr();
        this.offs = deserializer.readOffs();
        this.size = deserializer.readSize();

        this.link = deserializer.read32();
        this.info = deserializer.read32();

        this.addrAlign = deserializer.readAddr();
        this.entrySize = deserializer.readSize();
    }

    static fromStream(deserializer, elf, sectionIndex) {
        const elfSectionHeader = new ElfSectionHeader(sectionIndex);
        elfSectionHeader.#deserialize(deserializer, elf);
        return elfSectionHeader;
    }
}

//-----------------------------------------------------------------------------------------------//
// Elf Section
//-----------------------------------------------------------------------------------------------//

class ElfSection {

    constructor(elfSectionHeader) {
        this._resolved = false;
        this._header = elfSectionHeader;
        this._buffer = null;
        this.#deflate();
    }

    isResolved() { return this._resolved; }

    get buffer() { return this._buffer; }
    get bufferSize() { return this._buffer ? this._buffer.length : 0; }

    get header() { return this._header; }
    get type() { return this._header.type; }
    get format() { return this._header.format; }
    get elf() { return this._header.elf; }
    get name() { return this._header.name; }
    get index() { return this.header.index; }

    resolve() {
        if (this._resolved) return false;
        this._resolved = true;
        return true;
    }

    #deflate() {
        const header = this.header;
        if (header.offs > 0 && header.size > 0) {
            const elfBuffer = header.elf.buffer;
            this._buffer = elfBuffer.subarray(header.offs, header.offs + header.size);
        }
    }

    getDeserializer() {
        if (!this.buffer) return null;
        const deserializer = new ElfDeserializer(this.buffer, 0, {
            format: this.elf.format
        });
        return deserializer;
    }
}

ElfSection.TypeNone = ElfSectionTypes.None;
ElfSection.TypeProgBits = ElfSectionTypes.ProgBits;
ElfSection.TypeSymbolTable = ElfSectionTypes.SymbolTable;
ElfSection.TypeStringTable = ElfSectionTypes.StringTable;

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    ElfSection: ElfSection,
    ElfSectionHeader: ElfSectionHeader
}
