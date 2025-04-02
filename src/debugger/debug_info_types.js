//
// Debug Info
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

//-----------------------------------------------------------------------------------------------//
// Types and Constants
//-----------------------------------------------------------------------------------------------//

const DebugOpcodes =
    "adc,and,asl,bcc,bcs,beq,bit,bmi,bne,bpl,brk,bvc,bvs,clc,cld,cli,clv,cmp,cpx,cpy,dec,dex,"+
    "dey,eor,inc,inx,iny,jmp,jsr,lda,ldx,ldy,lsr,nop,ora,pha,php,pla,plp,rol,ror,rti,rts,sbc,"+
    "sec,sed,sei,sta,stx,sty,tax,tay,tsx,txa,txs,tya,";

const DebugLineTypes = {
    ASM:            0,          // default
    C:              1,
    MACRO:          2
};

const DebugDataType = {
    VOID :          0,
    BOOL :          1,
    INT8 :          2,
    UINT8 :         3,
    INT16 :         4,
    UINT16 :        5,
    INT32 :         6,
    UINT32 :        7,
    INT64 :         8,
    UINT64 :        9,
    FLOAT32 :       10,
    FLOAT64 :       11,
    ARRAY :         100,
    STRUCT :        101,
    POINTER :       102
};

DebugDataType.is_primitive = function(t) {
    return (t >= DebugDataType.BOOL && t <= DebugDataType.FLOAT64);
}

DebugDataType.is_array = function(t) {
    return (t == DebugDataType.ARRAY);
}

DebugDataType.is_struct = function(t) {
    return (t == DebugDataType.STRUCT);
}

DebugDataType.is_pointer = function(t) {
    return (t == DebugDataType.POINTER);
}

class DebugSymbol {
    constructor(name, value, isAddress, source, line, data_size, memory_size, num_children, data_type, type_name) {
        this.refId = null; // global (within debug-info) unique identifier
        this.index = null;
        this.name = name;
        this.value = value;
        this.isAddress = isAddress;
        this.source = source;
        this.line = line;
        this.data_size = data_size||0;      // element size
        this.memory_size = memory_size||0;  // overall size in memory
        this.num_children = num_children||null; // array element count (or null)
        this.data_type = data_type||null;   // numeric value of DebugDataType
        this.type_name = type_name||null;   // descriptive name of data type
        this.children = null; // child elements
        this.type_ref = null; // pointer type info
        this.stack_pointer_addr = null; // zero page address for stack pointer
        this.stack_pointer_offset = 0;
    }

    setChildren(children) {
        this.children = children;
        if (null != children) {
            this.num_children = children.length;
        }
    }

    setTypeRef(typeRef) {
        this.type_ref = typeRef;
    }

    setStackPointerAddress(stack_pointer_addr) {
        this.stack_pointer_addr = stack_pointer_addr;
    }

    setStackPointerOffset(stack_pointer_offset) {
        this.stack_pointer_offset = stack_pointer_offset;
    }
}

class DebugLabel {
    constructor(name, address, source, line) {
        this.name = name;
        this.address = address;
        this.source = source;
        this.line = line;
    }
}

class DebugMemory {
    constructor(name, startAddress, endAddress, source, line) {
        this.name = name;
        this.startAddress = startAddress;
        this.endAddress = endAddress;
        this.source = source;
        this.line = line;

        // compatibility with symbol info
        this.value = startAddress;
        this.memory_size = this.endAddress + 1 - this.startAddress;
        this.isAddress = true;
    }
}

class DebugAddressInfo {
    constructor(address, address_end, source, line, name) {
        this.address = address;
        this.address_end = address_end ? address_end : address;
        this.source = source != null ? path.resolve(path.normalize(source)) : null;
        this.normalizedPath = source != null ? Utils.normalizePath(source) : null;
        this.line = line;
        this.name = name;
        this.globalRef = null;
        this.localRef = null;
        this.localRefTable = null;
        this.debugSymbols = null;
        this.debugLabels = null;

        this.lineType = null;
        this.size = null;
    }

    isHighLevel() {
        if (!this.lineType) return false;
        return (this.lineType == DebugLineTypes.C);
    }

    compare(address, line) {
        if (address != null) {
            if (this.address > address) return 1;
            else if (this.address_end < address) return -1;
        } else if (line != null) {
            if (this.line > line) return 1;
            else if (this.line < line) return -1;
        }
        return 0;
    }

    addDebugSymbol(debugSymbol) {
        if (!this.debugSymbols) {
            this.debugSymbols = [ debugSymbol ];
        } else {
            this.debugSymbols.push(debugSymbol);
        }

        // store index as unique identifier (used for debugger variable resolution)
        debugSymbol.index = this.debugSymbols.length - 1;
    }

    getDebugSymbol(index) {
        if (null == this.debugSymbols) {
            return null;
        }

        if (index == null || index < 0 || index >= this.debugSymbols.length) {
            return null;
        }

        return this.debugSymbols[index];
    }

    addDebugLabel(debugLabel) {
        if (!this.debugLabels) {
            this.debugLabels = [ debugLabel ];
        } else {
            this.debugLabels.push(debugLabel);
        }
    }

    findLabel() {
        let item = this;

        while (item) {
            if (item.debugLabels && item.debugLabels.length > 0) {
                return item.debugLabels[0];
            }

            if (item.localRefTable && item.localRef != null && item.localRef > 0) {
                item = item.localRefTable[item.localRef-1];
            } else {
                break;
            }
        }

        return null;
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    DebugDataType: DebugDataType,
    DebugAddressInfo: DebugAddressInfo,
    DebugOpcodes: DebugOpcodes,
    DebugLineTypes: DebugLineTypes,
    DebugMemory: DebugMemory,
    DebugLabel: DebugLabel,
    DebugSymbol: DebugSymbol
}
