//
// Debug Info
//

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
const { ElfTagNames, ElfAttributeNames } = require('elf/types');
const { ElfFormCodes } = require('./types');

const StoreDebugInfo = true;

//-----------------------------------------------------------------------------------------------//
// Elf Debug Info Section
//-----------------------------------------------------------------------------------------------//

class ElfDebugInfoSection extends ElfSection {
    constructor(sectionHeader) {
        super(sectionHeader);
        this._entries = null;
    }

    get entries() { return this._entries; }

    resolve() {
        if (!super.resolve()) return;

        const elf = this.elf;

        const deserializer = this.getDeserializer();
        const endOfs = deserializer.ofs + this._header.size;

        while (!deserializer.eof()) {
            if (deserializer.ofs >= endOfs) {
                break;
            }

            const unitHeader = deserializer.readUnitHeader();
            if (unitHeader.version != 5) {
                throw(".debug_line version != 5 is not supported");
            }

            const unit = {
                elf: elf,
                section: this,
                header: unitHeader
            };

            deserializer.setFormat(unitHeader.format);
            unit.type = deserializer.read8();

            switch (unit.type) {
                case 0x1: { // DW_UT_compile
                    unit.addressSize = deserializer.read8();
                    unit.debugAbbrevOffset = deserializer.readOffs();
                    break;
                }
                case 0x2: { // DW_UT_type
                    unit.addressSize = deserializer.read8();
                    unit.debugAbbrevOffset = deserializer.readOffs();
                    unit.typeSignature = deserializer.read64();
                    unit.typeOffset = deserializer.readOffs();
                    break;
                }
                case 0x3: { // DW_UT_partial
                    unit.addressSize = deserializer.read8();
                    unit.debugAbbrevOffset = deserializer.readOffs();
                    break;
                }
                case 0x4: { // DW_UT_skeleton
                    unit.addressSize = deserializer.read8();
                    unit.debugAbbrevOffset = deserializer.readOffs();
                    unit.dwoId = deserializer.read64();
                    break;
                }
                case 0x5: { // DW_UT_split_compile
                    unit.addressSize = deserializer.read8();
                    unit.debugAbbrevOffset = deserializer.readOffs();
                    unit.dwoId = deserializer.read64();
                    break;
                }
                case 0x6: { // DW_UT_split_type
                    break;
                }
                default: {
                    break;
                }
            }

            if (deserializer.eof()) break;
            if (deserializer.ofs >= unitHeader.endOfs) continue;

            this._entries = new ElfDebugInformationEntry();
            let parent = this._entries;
            const entryStack = [];

            while (deserializer.ofs < unitHeader.endOfs) {
                let entry = ElfDebugInformationEntry.fromStream(deserializer, unit);

                if (entry == null) {
                    if (entryStack.length > 0) {
                        parent = entryStack.pop();
                    }
                } else {
                    parent.addChild(entry);
                    if (entry.hasChildren) {
                        entryStack.push(parent);
                        parent = entry;
                    }
                    this.#resolveEntry(entry);
                }
            }

            deserializer.setOffset(unitHeader.endOfs); // skip unread data
        }
    }

    #resolveEntry(entry) {
        if (!entry) return;

        /*
        if (entry.tag == ElfTagNames.Variable) {
            const name = entry.getAttribute(ElfAttributeNames.Name);
            const linkName = entry.getAttribute(ElfAttributeNames.LinkageName);
            if (name && linkName) {
                console.log(name.value + " := " + linkName.value);
            }
        }
        */

    }

}

class ElfDebugInformationEntry {
    constructor(unit) {
        this._unit = unit;
        this.tag = null;
        this.hasChildren = false;
        this.attributes = null;
        this.children = null;
    }

    addChild(child) {
        if (!this.children) {
            this.children = [];
        }

        this.children.push(child);
        child.parent = this;
    }

    getChildren() {
        return this.children;
    }

    getAttribute(attributeNameCode) {
        if (!this.attributes) return null;
        return this.attributes.get(attributeNameCode);
    }

    #deserialize(deserializer) {

        this.tag = null;

        const unit = this._unit;
        const elf = unit.elf;

        const abbreviationTable = elf.getSection(".debug_abbrev");
        if (!abbreviationTable) return;

        const params = {
            addressSize: unit.addressSize,
            stringTable: elf.getSection(".debug_str"),
            stringOffsetTable: elf.getSection(".debug_str_offsets"),
            addressTable: elf.getSection(".debug_addr")
        }

        const abbreviationCode = deserializer.readULEB128();
        if (!abbreviationCode) return;

        const infoStruct = abbreviationTable.get(abbreviationCode);
        if (!infoStruct) return;

        this.tag = infoStruct.tag;
        this.tagName = Utils.getEnumKey(ElfTagNames, this.tag);

        //console.log("TAG: " + this.tagName + "------------------------");

        this.hasChildren = infoStruct.hasChildren;

        if (infoStruct.attributes) {
            this.attributes = new Map();
            for (const attributeSpec of infoStruct.attributes) {

                /*
                const deb0 = Utils.getEnumKey(ElfAttributeNames, attributeSpec.name);
                const deb1 = Utils.getEnumKey(ElfFormCodes, attributeSpec.formCode);
                console.log(deb0 + " / " + deb1);
                */

                const value = deserializer.readAttribute(attributeSpec.formCode, params);
                const attribute = {
                    code: attributeSpec.name,
                    value: value
                };

                if (StoreDebugInfo) {
                    attribute.name = Utils.getEnumKey(ElfAttributeNames, attributeSpec.name);
                    attribute.formCode = attributeSpec.formCode;
                    attribute.formCodeName = Utils.getEnumKey(ElfFormCodes, attributeSpec.formCode);
                    //console.log("(" + name + " : " + Utils.getEnumKey(ElfFormCodes, attributeSpec.formCode) + ")");
                    //console.log(name + " = " + attribute.value);
                }

                this.attributes.set(attribute.code, attribute);
            }
        }
    }

    static fromStream(deserializer, unit) {
        const entry = new ElfDebugInformationEntry(unit);
        entry.#deserialize(deserializer);
        if (null == entry.tag) return null; // end entry
        return entry;
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    ElfDebugInfoSection: ElfDebugInfoSection
}
