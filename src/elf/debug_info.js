//
// Dwarf Debug Info
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
const { DwarfTagIds, DwarfAttributeIds, DwarfFormCodes, DwarfUnitTypes } = require('elf/types');

const STORE_TEMP_VERBOSE_DEBUG_INFO = true;

//-----------------------------------------------------------------------------------------------//
// Dwarf Debug Info Section
//-----------------------------------------------------------------------------------------------//

class DwarfDebugInfoSection extends ElfSection {
    constructor(sectionHeader) {
        super(sectionHeader);
        this._entries = null;
    }

    get entries() { return this._entries; }

    resolve() {
        if (!super.resolve()) return;

        const deserializer = this.getDeserializer();
        const endOfs = deserializer.ofs + this._header.size;

        this._entries = [];

        while (!deserializer.eof()) {
            if (deserializer.ofs >= endOfs) {
                break;
            }

            const unit = DwarfUnit.fromStream(this, deserializer);
            if (null != unit) {
                this._entries.push(unit);
            }

            /*
            if (deserializer.eof()) break;
            if (deserializer.ofs >= unitHeader.endOfs) continue;

            let parentTag = null;
            const stack = [];

            while (deserializer.ofs < unitHeader.endOfs) {
                let tag = DwarfTag.fromStream(deserializer, unit);

                if (tag == null) {
                    parentTag = stack.pop();
                } else {
                    if (null != parentTag) {
                        parentTag.addChild(tag);
                    } else {
                        unit.addChild(tag);
                    }

                    if (tag.hasChildren) {
                        if (null != parentTag) {
                            stack.push(parentTag);
                        }
                        parentTag = tag;
                    }

                    this.#resolveEntry(tag);
                }
            }

            deserializer.setOffset(unitHeader.endOfs); // skip unread data
            */
        }
    }

}

class DwarfItem {
    constructor(parent) {
        this.parent = parent;
        this.hasChildren = false;
        this.children = null;
    }

    addChild(child) {
        if (!this.children) {
            this.children = [];
        }

        this.children.push(child);
        child.parent = this;

        this.hasChildren = true;
    }

    getChildren() {
        return this.children;
    }

}

class DwarfTag extends DwarfItem {
    constructor(parent) {
        super(parent);
        this.id = null;
        this.elf = (parent != null) ? parent.elf : null;
        this.attributes = null;
    }

    getAttribute(attributeNameCode) {
        if (!this.attributes) return null;
        return this.attributes.get(attributeNameCode);
    }

    #deserialize(deserializer) {

        this.id = null;
        const unit = this.parent;
        const elf = this.elf;

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

        this.id = infoStruct.tag;
        this.tagName = Utils.getEnumKey(DwarfTagIds, this.id);

        this.hasChildren = infoStruct.hasChildren;

        if (infoStruct.attributes) {
            this.attributes = new Map();
            for (const attributeSpec of infoStruct.attributes) {

                const value = deserializer.readAttribute(attributeSpec.formCode, params);
                const attribute = {
                    code: attributeSpec.name,
                    value: value
                };

                if (STORE_TEMP_VERBOSE_DEBUG_INFO) {
                    attribute.name = Utils.getEnumKey(DwarfAttributeIds, attributeSpec.name);
                    attribute.formCode = attributeSpec.formCode;
                    attribute.formCodeName = Utils.getEnumKey(DwarfFormCodes, attributeSpec.formCode);
                    //console.log("(" + name + " : " + Utils.getEnumKey(DwarfFormCodes, attributeSpec.formCode) + ")");
                    //console.log(name + " = " + attribute.value);
                }

                this.attributes.set(attribute.code, attribute);
            }
        }
    }

    resolve() {
        /*
        if (this.id == DwarfTagIds.Variable) {
            const name = this.getAttribute(DwarfAttributeIds.Name);
            const linkName = this.getAttribute(DwarfAttributeIds.LinkageName);
            if (name && linkName) {
                console.log(name.value + " := " + linkName.value);
            }
        }
        */
    }

    static fromStream(deserializer, unit) {
        const tag = new DwarfTag(unit);
        tag.#deserialize(deserializer);
        if (null == tag.id) return null; // end entry
        return tag;
    }

}

//-----------------------------------------------------------------------------------------------//
// Dwarf Unit
//-----------------------------------------------------------------------------------------------//

class DwarfUnit extends DwarfItem {
    constructor(parent) {
        super(parent);
        this.elf = (parent != null) ? parent.elf : null;
        this.type = null;
        this.header = null;
        this.addressSize = null;
        this.debugAbbrevOffset = null;
        this.typeSignature = null;
        this.typeOffset = null;
        this.dwoId = null;
    }

    #deserialize(deserializer) {

        const unitHeader = deserializer.readDwarfUnitHeader();
        if (unitHeader.version != 5) {
            throw("DWARF version != 5 is not supported");
        }

        this.header = unitHeader;
        deserializer.setFormat(unitHeader.format);

        this.#deserializeFields(deserializer);
        this.#deserializeTags(deserializer);

        deserializer.setOffset(unitHeader.endOfs); // skip unread data
    }

    #deserializeFields(deserializer) {
        this.type = deserializer.read8();

        switch (this.type) {
            case DwarfUnitTypes.Compile: { // DW_UT_compile
                this.addressSize = deserializer.read8();
                this.debugAbbrevOffset = deserializer.readOffs();
                break;
            }
            case DwarfUnitTypes.Type: { // DW_UT_type
                this.addressSize = deserializer.read8();
                this.debugAbbrevOffset = deserializer.readOffs();
                this.typeSignature = deserializer.read64();
                this.typeOffset = deserializer.readOffs();
                break;
            }
            case DwarfUnitTypes.Partial: { // DW_UT_partial
                this.addressSize = deserializer.read8();
                this.debugAbbrevOffset = deserializer.readOffs();
                break;
            }
            case DwarfUnitTypes.Skeleton: { // DW_UT_skeleton
                this.addressSize = deserializer.read8();
                this.debugAbbrevOffset = deserializer.readOffs();
                this.dwoId = deserializer.read64();
                break;
            }
            case DwarfUnitTypes.SplitCompile: { // DW_UT_split_compile
                this.addressSize = deserializer.read8();
                this.debugAbbrevOffset = deserializer.readOffs();
                this.dwoId = deserializer.read64();
                break;
            }
            case DwarfUnitTypes.SplitType: { // DW_UT_split_type
                break;
            }
            default: {
                break;
            }
        }
    }

    #deserializeTags(deserializer) {
        const unitHeader = this.header;

        if (deserializer.eof()) return;
        if (deserializer.ofs >= unitHeader.endOfs) return;

        let parentTag = null;
        const stack = [];

        while (deserializer.ofs < unitHeader.endOfs) {
            let tag = DwarfTag.fromStream(deserializer, this);

            if (tag == null) {
                parentTag = stack.pop();
            } else {
                if (null != parentTag) {
                    parentTag.addChild(tag);
                } else {
                    this.addChild(tag);
                }

                if (tag.hasChildren) {
                    if (null != parentTag) {
                        stack.push(parentTag);
                    }
                    parentTag = tag;
                }

                tag.resolve();
            }
        }
    }

    static fromStream(section, deserializer) {
        const unit = new DwarfUnit(section);
        unit.#deserialize(deserializer);
        return unit;
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    DwarfDebugInfoSection: DwarfDebugInfoSection
}
