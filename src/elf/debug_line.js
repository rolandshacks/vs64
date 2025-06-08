//
// Dwarf Debug Line Info
//

const path = require('path');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { Utils } = require('utilities/utils');
const { ElfSection } = require('elf/section');
const { DwarfTypeCodes } = require('elf/types');

//-----------------------------------------------------------------------------------------------//
// Debug Line Section
//-----------------------------------------------------------------------------------------------//

class DwarfDebugLineSection extends ElfSection {
    constructor(sectionHeader) {
        super(sectionHeader);
        this._lineStringSection = null;
        this._includes = null;
        this._files = null;
        this._entries = [];
    }

    get includes() { return this._includes; }
    get files() { return this._files; }
    get entries() { return this._entries; }

    #deserializePathList(deserializer) {

        const pathList = [];

        while (!deserializer.eof() && deserializer.peek()) {
            const pathInfo = {};
            pathInfo.path = deserializer.readCString();
            pathList.push(pathInfo)
        }

        return pathList;
    }

    #deserializePathAttributeList(deserializer, unit) {

        const pathList = [];
        const addressSize = unit.header.addressSize;

        const lineStrSection = this._lineStringSection;
        const formatCount = deserializer.read8();
        const attributes = [];
        for (let i=0; i<formatCount; i++) {
            const attribute = {
                contentTypeCode: deserializer.readULEB128(),
                formCode: deserializer.readULEB128()
            }

            if (attribute.contentTypeCode != 0 || attribute.formCode != 0) {
                attributes.push(attribute);
            };
        }

        const attributeParams = {
            stringTable: lineStrSection,
            addressSize: addressSize
        };

        const entryCount = deserializer.readULEB128();
        for (let i=0; i<entryCount; i++) {
            const pathInfo = {};
            for (const attribute of attributes) {

                const value = deserializer.readAttribute(attribute.formCode, attributeParams);

                const contentType = attribute.contentTypeCode;
                switch (contentType) {
                    case DwarfTypeCodes.Path: {
                        pathInfo.path = value;
                        break;
                    }
                    case DwarfTypeCodes.Index: {
                        pathInfo.index = value;
                        break;
                    }
                    case DwarfTypeCodes.Timestamp: {
                        pathInfo.timestamp = value;
                        break;
                    }
                    case DwarfTypeCodes.Size: {
                        pathInfo.size = value;
                        break;
                    }
                    case DwarfTypeCodes.MD5: {
                        pathInfo.md5 = value;
                        break;
                    }
                    default: {
                        break;
                    }
                }
            }

            pathList.push(pathInfo);
        }

        return pathList;
    }

    #resolveFiles(files, lookupPaths) {
        if (!files || files.length < 1) return;

        const baseEntry = files[0].path;
        let baseDir = null;

        if (path.isAbsolute(baseEntry)) {
            baseDir = Utils.isFile(baseEntry) ?
                path.dirname(baseEntry) : baseEntry;
        }

        for (const fileInfo of files) {
            if (path.isAbsolute(fileInfo.path)) {
                continue;
            }

            if (baseDir) {
                const absPath = path.resolve(baseDir, fileInfo.path);
                if (Utils.fileExists(absPath)) {
                    fileInfo.path = Utils.normalizePath(absPath);
                    continue;
                }
            }

            if (lookupPaths) {
                for (const lookupPath of lookupPaths) {
                    const absPath = path.resolve(lookupPath.path, fileInfo.path);
                    if (Utils.fileExists(absPath)) {
                        fileInfo.path = Utils.normalizePath(absPath);
                        continue;
                    }
                }
            }

        }
    }

    resolve() {
        if (!super.resolve()) return;

        const elf = this.elf;
        this._lineStringSection = elf.getSection(".debug_line_str");

        const deserializer = this.getDeserializer();

        const units = [];

        const endOfs = deserializer.ofs + this._header.size;

        while (!deserializer.eof()) {

            if (deserializer.ofs >= endOfs) {
                break;
            }

            const unitHeader = deserializer.readDwarfUnitHeader();
            if (unitHeader.version != 5) {
                throw("DWARF version != 5 is not supported");
            }

            const unit = {};
            unit.header = unitHeader;
            deserializer.setFormat(unitHeader.format);

            if (unitHeader.version >= 5) {
                unitHeader.addressSize = deserializer.read8();
                unitHeader.segmentSelectorSize = deserializer.read8();
            }

            const headerLength = deserializer.readSize();
            const unitDataOffset = deserializer.ofs + headerLength;

            unitHeader.minimumInstructionLength = deserializer.read8();

            if (unitHeader.version >= 4) {
                unitHeader.maximumOperationsPerInstruction = deserializer.read8();
            } else {
                unitHeader.maximumOperationsPerInstruction = 1; // default
            }

            unitHeader.defaultIsStmt = deserializer.read8();
            unitHeader.lineBase = deserializer.read8s();
            unitHeader.lineRange = deserializer.read8();

            unitHeader.opcodeBase = deserializer.read8();
            unitHeader.opcodeLengths = [0];
            for (let i=1; i<unitHeader.opcodeBase; i++) {
                const opcodeLength = deserializer.read8();
                unitHeader.opcodeLengths.push(opcodeLength);
            }

            if (unitHeader.version >= 5) {
                unit.includes = this.#deserializePathAttributeList(deserializer, unit);
                unit.files = this.#deserializePathAttributeList(deserializer, unit);
            } else {
                unit.includes = this.#deserializePathList(deserializer);
                unit.files = this.#deserializePathList(deserializer);
            }

            this.#resolveFiles(unit.includes);
            this.#resolveFiles(unit.files, unit.includes);

            if (deserializer.ofs >= endOfs) {
                break;
            }

            deserializer.setOffset(unitDataOffset);
            const program = new DwarfDebugLineProgram(this, unit);
            program.resolve(deserializer);

            unit.program = program;

            units.push(unit);
        }

    }

    addEntry(entry) {
        this._entries.push(entry);
    }

}

//-----------------------------------------------------------------------------------------------//
// Debug Line Info
//-----------------------------------------------------------------------------------------------//

class DwarfDebugLineEntry {
    constructor(address, address_end, source, line) {
        this.address = address;
        this.address_end = address_end ? address_end : address;
        this.source = source;
        this.line = line;
    }
}

//-----------------------------------------------------------------------------------------------//
// Debug Line Program
//-----------------------------------------------------------------------------------------------//

class DwarfDebugLineProgram {
    constructor(section, unit) {
        this._section = section;
        this._unit = unit;
        this._state = {};
        this._lastLine = null;
    }

    #reset() {
        const header = this._unit.header;
        const state = this._state;
        state.address = 0;
        state.address_end = 0;
        state.op_index = 0;
        state.file = 1;
        state.line = 1;
        state.column = 0;
        state.is_stmt = header.defaultIsStmt;
        state.basic_block = false;
        state.end_sequence = false;
        state.prologue_end = false;
        state.epilogue_begin = false;
        state.isa = 0;
        state.discriminator = 0;

        this._lastLine = null;
    }

    #advance(steps) {

        steps = Math.floor(steps);

        const header = this._unit.header;
        const state = this._state;
        const op_index = state.op_index + steps;

        state.address += header.minimumInstructionLength * Math.floor((op_index / header.maximumOperationsPerInstruction));
        state.op_index = op_index % header.maximumOperationsPerInstruction;
    }

    #pushState() {
        const state = this._state;
        const unit = this._unit;

        if (state.is_stmt) {
            //console.log("0x" + state.address.toString(16) + " : " + unit.files[state.file].path + ", line " + state.line);
            if (null == this._lastLine || this._lastLine.file != state.file || this._lastLine.line != state.line) {
                this._section.addEntry(new DwarfDebugLineEntry(
                    state.address,
                    state.address,
                    unit.files[state.file].path,
                    state.line
                ));

                if (null == this._lastLine) {
                    this._lastLine = {};
                }

                this._lastLine.file = state.file;
                this._lastLine.line = state.line;
            } else {
                console.log("duplicate");
            }
        }

        // no need to store information
        // const stateClone = Object.assign({}, state);
        // this._program.push(stateClone);

        state.basic_block = false;
        state.prologue_end = false;
        state.epilogue_begin = false;
        state.discriminator = 0;
    }

    resolve(deserializer) {
        const unit = this._unit;
        const unitHeader = unit.header;
        const addressSize = unitHeader.addressSize;

        const state = this._state;

        this.#reset();

        const endOfs = unitHeader.endOfs;

        while (!deserializer.eof()) {
            if (deserializer.ofs >= endOfs) {
                break;
            }

            let opcode = deserializer.read8();
            if (opcode == null) break; // eof

            if (opcode >= unitHeader.opcodeBase) {

                // Special opcodes

                const adjustedOpcode = opcode - unitHeader.opcodeBase;

                //console.log("SPECIAL OPCODE: " + opcode + " / " + adjustedOpcode);

                this.#advance(adjustedOpcode / unitHeader.lineRange);
                const lineDelta = unitHeader.lineBase + (adjustedOpcode % unitHeader.lineRange);
                state.line += lineDelta;

                this.#pushState();

            } else if (0 != opcode) {

                // Standard opcodes

                //console.log("STANDARD OPCODE: " + opcode);

                switch (opcode) {
                    case 1: { // DW_LNS_copy
                        this.#pushState();
                        break;
                    }
                    case 2: { // DW_LNS_advance_pc
                        const num = deserializer.readULEB128();
                        this.#advance(num);
                        break;
                    }
                    case 3: { // DW_LNS_advance_line
                        const num = deserializer.readLEB128();
                        state.line += num;
                        break;
                    }
                    case 4: { // DW_LNS_set_file
                        const num = deserializer.readULEB128();
                        state.file = num;
                        break;
                    }
                    case 5: { // DW_LNS_set_column
                        const num = deserializer.readULEB128();
                        state.column = num;
                        break;
                    }
                    case 6: { // DW_LNS_negate_stmt
                        state.is_stmt = !state.is_stmt;
                        break;
                    }
                    case 7: { // DW_LNS_set_basic_block
                        state.basic_block = true;
                        break;
                    }
                    case 8: { // DW_LNS_const_add_pc
                        this.#advance((255 - unitHeader.opcodeBase) / unitHeader.lineRange);
                        break;
                    }
                    case 9: { // DW_LNS_fixed_advance_pc
                        const num = deserializer.read16();
                        state.address += num;
                        break;
                    }
                    case 10: { // DW_LNS_set_prologue_end
                        state.prologue_end = true;
                        break;
                    }
                    case 11: { // DW_LNS_set_epilogue_begin
                        state.epilogue_begin = true;
                        break;
                    }
                    case 12: { // DW_LNS_set_isa
                        const num = deserializer.readULEB128();
                        state.isa = num;
                        break;
                    }
                    default: {
                        //console.log("unhandled standard opcode");

                        // unhandled standard opcode. skip the unused params
                        for (let i=0; i<unitHeader.opcodeLengths[opcode]; i++) {
                            deserializer.readULEB128();
                        }
                        break;
                    }
                }
            } else {

                // Extended opcodes

                const instructionSize = deserializer.readULEB128();

                if (instructionSize == 0) {
                    throw("unexpected instruction size");
                }

                let avail = instructionSize;
                opcode = deserializer.read8(); avail--;

                //console.log("EXTENDED OPCODE: " + opcode + "  size: " + instructionSize);

                switch (opcode) {
                    case 1: { // DW_LNE_end_sequence
                        state.end_sequence = true;
                        this.#pushState();
                        this.#reset();
                        break;
                    }
                    case 2: { // DW_LNE_set_address
                        if (avail < addressSize) {
                            throw("unexpected end of data");
                        }
                        const num = deserializer.read(addressSize);
                        avail -= addressSize;
                        state.address = num;
                        state.op_index = 0;
                        break;
                    }
                    case 3: { // DW_LNE_define_file
                        // this opcode is deprecated in DWARF version 5
                        break;
                    }
                    case 4: { // DW_LNE_set_discriminator
                        const num = deserializer.readLEB128();
                        state.discriminator = num;
                        break;
                    }
                    default: {
                        //console.log("unhandled extended opcode");
                        break;
                    }
                }

                if (avail > 0) {
                    deserializer.skip(avail);
                }

            }

        }

    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    DwarfDebugLineSection: DwarfDebugLineSection
}
