//
// Debug Info - Oscar64
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

//const { Utils } = require('utilities/utils');
const { DebugSymbol, DebugAddressInfo, DebugDataType, DebugMemory } = require('debugger/debug_info_types');

class Oscar64DebugInfo {
    static load(debug_info, project, filename) {
        Oscar64DebugParser.parse(debug_info, filename);
    }
}

class Oscar64DebugParser {

    static getTypeId(type, sz) {
        let data_type = null;

        if (type == "int") {
            if (sz == 1) data_type = DebugDataType.INT8;
            else if (sz == 2) data_type = DebugDataType.INT16;
            else if (sz == 4) data_type = DebugDataType.INT32;
            else if (sz == 8) data_type = DebugDataType.INT64;
        } else if (type == "uint") {
            if (sz == 1) data_type = DebugDataType.UINT8;
            else if (sz == 2) data_type = DebugDataType.UINT16;
            else if (sz == 4) data_type = DebugDataType.UINT32;
            else if (sz == 8) data_type = DebugDataType.UINT64;
        } else if (type == "bool" && sz == 1) {
            data_type = DebugDataType.BOOL;
        } else if (type == "float" && sz == 4) {
            data_type = DebugDataType.FLOAT32;
        } else if (type == "double" && sz == 8) {
            data_type = DebugDataType.FLOAT64;
        } else if (type == "array") {
            data_type = DebugDataType.ARRAY;
        } else if (type == "struct") {
            data_type = DebugDataType.STRUCT;
        }

        return data_type;
    }

    static decodeTypes(typeInfos) {
        const types = [];

        for (const typeInfo of typeInfos) {
            const typeId = Oscar64DebugParser.getTypeId(typeInfo.type, typeInfo.size);
            const t = {
                name: typeInfo.name || "",
                type: typeId,
                size: typeInfo.size || 0,
                children: null
            }
            types.push(t);
        }

        let idx = 0;
        for (const t of types) {
            const typeInfo = typeInfos[idx++];
            if (t.type == DebugDataType.STRUCT && typeInfo.members) {
                const children = [];
                for (const member of typeInfo.members) {
                    const memberType = types[member.typeid];
                    if (null == memberType) continue;
                    const m = {
                        name: member.name,
                        offset: member.offset,
                        type: memberType
                    }
                    children.push(m);
                }
                t.struct_info = children;
            } else if (t.type == DebugDataType.ARRAY) {
                const elementType = types[typeInfo.eid];
                if (null == elementType) continue;
                const elementSize = elementType.size||1;
                const elementCount = t.size / elementSize;
                t.array_info = {
                    count: elementCount,
                    type: elementType
                };
            }
        }

        return types;
    }

    static decodeVariable(types, variable, struct_member) {
        if (!variable || !variable.name) return null;

        const name = struct_member ? struct_member.name : variable.name;
        const type_info = struct_member ?  struct_member.type : types[variable.typeid];
        if (null == type_info) return null;

        let data_type = type_info.type || DebugDataType.VOID;

        const is_array = DebugDataType.is_array(data_type);
        const is_struct = DebugDataType.is_struct(data_type);

        let addr = variable.start + (struct_member ? struct_member.offset : 0);
        let addr_end = (struct_member ? addr + type_info.size : variable.end);

        let type_name = null;
        let num_children = null;
        let data_size = type_info.size;
        let mem_size = addr_end - addr;

        if (is_array) {
            const array_info = type_info.array_info;
            if (null == array_info || null == array_info.type) return null;
            const array_type = array_info.type;
            data_type = array_type.type || DebugDataType.VOID; // overwrite 'array' with actual element type
            data_size = array_type.size || 0;
            num_children = array_info.count;

        } else if (is_struct) {
            type_name = type_info.name;
            data_size = 0;
        }

        const debug_symbol = new DebugSymbol(
            name,
            addr,
            true,
            "", 0,
            data_size,
            mem_size,
            num_children,
            data_type,
            type_name
        );

        if (type_info.struct_info) {
            const children = [];
            for (const struct_member of type_info.struct_info) {
                const childDebugSymbol = Oscar64DebugParser.decodeVariable(types, variable, struct_member);
                if (null != childDebugSymbol) {
                    children.push(childDebugSymbol);
                }
            }
            debug_symbol.setChildren(children);
        }

        return debug_symbol;

    }

    static parse(debug_info, filename) {

        let json_raw = null;

        try {
            json_raw = fs.readFileSync(filename, "utf8");
        } catch (err) {
            if (err.code == 'ENOENT') {
                throw("debug info file " + filename + " does not exist");
            } else {
                throw("unable to read debug info '" + filename + "'");
            }
        }

        // convert relaxed JSON to non-relaxed JSON
        const json_str = json_raw.replace(/([{,])\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, "$1\"$2\":");

        let json = JSON.parse(json_str);

        const types = Oscar64DebugParser.decodeTypes(json.types);

        const functions = [];

        if (json.functions) {
            for (const func of json.functions) {

                if (!func.name) continue;

                const funcInfo = new DebugAddressInfo(
                    func.start,
                    func.end - 1,
                    func.source,
                    func.line,
                    func.name
                );

                if (null != func.variables) {
                    for (const variable of func.variables) {
                        let debugSymbol = Oscar64DebugParser.decodeVariable(types, variable);
                        if (null == debugSymbol) continue;
                        funcInfo.addDebugSymbol(debugSymbol);
                    }
                }

                functions.push(funcInfo);

                if (!func.lines) continue;

                for (const line of func.lines) {

                    const addressInfo = new DebugAddressInfo(
                        line.start,
                        line.end - 1,
                        line.source,
                        line.line
                    );

                    addressInfo.globalRef = debug_info._addresses.length;
                    debug_info._addresses.push(addressInfo);

                    for (let addr = addressInfo.address; addr <= addressInfo.address_end; addr++) {
                        debug_info._addressMap[addr] = addressInfo;
                    }

                    const normalizedPath = debug_info.getRefName(line.source);
                    const currentSourceRef = debug_info.getOrCreateLineList(normalizedPath);
                    if (null != currentSourceRef) {
                        addressInfo.localRef = currentSourceRef.length;
                        addressInfo.localRefTable = currentSourceRef;
                        currentSourceRef.push(addressInfo);
                    }

                }
            }
        }

        if (json.variables) {
            for (const variable of json.variables) {
                let debugSymbol = Oscar64DebugParser.decodeVariable(types, variable);
                if (null == debugSymbol) continue;
                debug_info.storeSymbol(debugSymbol);
            }
        }

        let memblocks = [];

        if (json.memory) {
            for (const memblock of json.memory) {

                if (!memblock.name || memblock.type != "DATA") continue;

                const memblockInfo = new DebugMemory(
                    memblock.name,
                    memblock.start,
                    memblock.end-1,
                    memblock.source,
                    memblock.line
                );

                memblocks.push(memblockInfo);
            }
        }

        debug_info.setFunctions(functions.length > 0 ? functions : null);
        debug_info.setMemBlocks(memblocks.length > 0 ? memblocks : null);
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Oscar64DebugInfo: Oscar64DebugInfo
}
