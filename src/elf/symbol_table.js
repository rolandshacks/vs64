//
// Symbol Table
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

const { ElfSection } = require('elf/section');
const { ElfConstants } = require('elf/types');

//-----------------------------------------------------------------------------------------------//
// Elf Symbol Table
//-----------------------------------------------------------------------------------------------//

class ElfSymbolTable extends ElfSection {
    constructor(sectionHeader) {
        super(sectionHeader);
        this._stringTable = null;
        this._numSymbols = 0;
    }

    resolve() {
        if (!super.resolve()) return;

        const elf = this.elf;
        this._stringTable = elf.getSection(".strtab");

        const bufferSize = this.bufferSize;
        const entrySize = this.header.entrySize;
        this._numSymbols = (entrySize > 0) ? bufferSize / entrySize : 0;

    }

    getSymbolCount() {
        return this._numSymbols;
    }

    getSymbol(index) {
        const entrySize = this.header.entrySize;
        if (entrySize < 1) return null;

        const buffer = this.buffer;
        const ofs = index * entrySize;

        if (ofs < 0 || ofs + entrySize > buffer.length) {
            throw("symbol index out of bounds");
        }

        const deserializer = this.getDeserializer();
        deserializer.setOffset(ofs);

        const symbol = ElfSymbol.fromStream(deserializer, this._stringTable);

        return symbol;

    }
}

//-----------------------------------------------------------------------------------------------//
// Elf Symbol
//-----------------------------------------------------------------------------------------------//

class ElfSymbol {
    constructor() {
    }

    get name() { return this._name; }

    #deserialize(deserializer, stringTable) {

        const nameRef = deserializer.read32();

        if (stringTable) {
            this._name = stringTable.get(nameRef);
        }

        this.value = deserializer.readSize();
        this.size = deserializer.read32();

        const info = deserializer.read8();
        this.binding = ((info >> 4) & 0xff);
        this.type = (info & 0x0f);

        this.other = deserializer.read8();
        this.refSectionIndex = deserializer.read16();

    }

    static fromStream(deserializer, stringTable) {
        const symbol = new ElfSymbol();
        symbol.#deserialize(deserializer, stringTable);
        return symbol;
    }
}

ElfSymbol.BindingLocal = ElfConstants.SymbolBindingLocal;
ElfSymbol.BindingGlobal = ElfConstants.SymbolBindingGlobal;
ElfSymbol.BindingWeak = ElfConstants.SymbolBindingWeak;
ElfSymbol.TypeNone = ElfConstants.SymbolTypeNone;
ElfSymbol.TypeObject = ElfConstants.SymbolTypeObject;
ElfSymbol.TypeFunction = ElfConstants.SymbolTypeFunction;
ElfSymbol.TypeSection = ElfConstants.SymbolTypeSection;
ElfSymbol.TypeFile = ElfConstants.SymbolTypeFile;

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    ElfSymbolTable: ElfSymbolTable,
    ElfSymbol: ElfSymbol
}
