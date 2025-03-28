//
// Debug Variables
//

const DebugAdapter = require('@vscode/debugadapter');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { Formatter } = require('utilities/utils');
const { DebugDataType } = require('debugger/debug_info_types');

//const { Logger } = require('utilities/logger');
//const logger = new Logger("DebugVariables");

//-----------------------------------------------------------------------------------------------//
// Constants
//-----------------------------------------------------------------------------------------------//

const DebugVariables = {
    VARIABLES_REGISTERS: 1,
    VARIABLES_FLAGS: 2,
    VARIABLES_SYSINFO: 3,
    VARIABLES_MEMORY: 4,
    VARIABLES_SYMBOLS: 5,
    VARIABLES_VIC: 6,
    VARIABLES_SPRITES: 7,
    VARIABLES_BASIC: 8,
    VARIABLES_BASIC_REGISTERS: 9,
    VARIABLES_BASIC_VECTORS: 10,
    VARIABLES_LOCALS: 11,

    VARIABLES_SPRITES_BEGIN: 100,
    VARIABLES_SPRITES_END: 107,

    VARIABLES_BASIC_ARRAYS_BEGIN: 0x10000,
    VARIABLES_BASIC_ARRAYS_END: 0x1FFFF,

    VARIABLES_SYMBOLS_MEMBERS_BEGIN: 0x20000,
    VARIABLES_SYMBOLS_MEMBERS_END: 0x2FFFF,

    VARIABLES_LOCALS_MEMBERS_BEGIN: 0x30000,
    VARIABLES_LOCALS_MEMBERS_END: 0x3FFFF
};

//-----------------------------------------------------------------------------------------------//
// Debug Variables
//-----------------------------------------------------------------------------------------------//
class DebugVariablesProvider {

    // session constructor
    constructor(session) {
        this._session = session;
    }

    getScopes() {

        const session = this._session;

        const scopes = []

        if (session.isBasic) {
            scopes.push(
                ["BASIC",               DebugVariables.VARIABLES_BASIC],
                ["BASIC Registers",     DebugVariables.VARIABLES_BASIC_REGISTERS],
                ["BASIC Vectors",       DebugVariables.VARIABLES_BASIC_VECTORS],
            );
        }

        scopes.push(
            ["Locals",                  DebugVariables.VARIABLES_LOCALS],
            ["CPU Registers",           DebugVariables.VARIABLES_REGISTERS],
            ["CPU Flags",               DebugVariables.VARIABLES_FLAGS],
            ["Symbols",                 DebugVariables.VARIABLES_SYMBOLS],
            ["Memory",                  DebugVariables.VARIABLES_MEMORY],
            ["Stats",                   DebugVariables.VARIABLES_SYSINFO],
            ["Video (VIC)",             DebugVariables.VARIABLES_VIC],
            ["Sprites (VIC)",           DebugVariables.VARIABLES_SPRITES],
        );

        return scopes;
    }

    async variablesRequest(response, args) {

        const session = this._session;
        const stateProvider = session._stateProvider;

        const emu = session._emulator;
        if (!emu) {
            response.success = false;
            response.message = "invalid state";
            return;
        }

        const debugInfo = session._debugInfo;
        const profiler = emu._profiler;
        const cyclesDelta = profiler ? profiler.cyclesDelta : 0;
        const cpuTimeDelta = profiler ? profiler.cpuTimeDelta : "";

        args = args||{};

        const cpuState = emu.getCpuState();

        let variables = null;

        if (null == args.filter || args.filter == "named") {

            if (DebugVariables.VARIABLES_LOCALS == args.variablesReference) {

                variables = [];

                let addr = cpuState.cpuRegisters.PC;
                let functionInfo = debugInfo.getFunctionByAddr(addr);

                if (null != functionInfo && null != functionInfo.debugSymbols) {

                    const symbols = functionInfo.debugSymbols;

                    let unpackedSymbols = await session.unpackSymbols(symbols);
                    if (unpackedSymbols) {
                        for (const unpackedSymbol of unpackedSymbols) {
                            if (null != unpackedSymbol) {
                                if (unpackedSymbol.indexedVariables > 0 && unpackedSymbol.variablesReference != null) {
                                    unpackedSymbol.variablesReference += DebugVariables.VARIABLES_LOCALS_MEMBERS_BEGIN;
                                }
                                variables.push(unpackedSymbol);
                            }
                        }
                    }
                }

            } else if (DebugVariables.VARIABLES_REGISTERS == args.variablesReference) {

                let registers = cpuState.cpuRegisters;

                variables = [
                    { name: "(accumulator) A",      type: "register", value: Formatter.formatU8(registers.A), variablesReference: 0 },
                    { name: "(register) X",         type: "register", value: Formatter.formatU8(registers.X), variablesReference: 0 },
                    { name: "(register) Y",         type: "register", value: Formatter.formatU8(registers.Y), variablesReference: 0 },
                    { name: "(stack pointer) SP",   type: "register", value: Formatter.formatU8(registers.S), variablesReference: 0 },
                    { name: "(program counter) PC", type: "register", value: Formatter.formatAddress(registers.PC), variablesReference: 0, memoryReference: registers.PC }
                ];

            } else if (DebugVariables.VARIABLES_FLAGS == args.variablesReference) {

                let flags = cpuState.cpuFlags;

                variables = [
                    { name: "(negative) N",    type: "flag", value: Formatter.formatBit(flags.N), variablesReference: 0 },
                    { name: "(overflow) V",    type: "flag", value: Formatter.formatBit(flags.V), variablesReference: 0 },
                    { name: "(break) B",       type: "flag", value: Formatter.formatBit(flags.B), variablesReference: 0 },
                    { name: "(decimal) D",     type: "flag", value: Formatter.formatBit(flags.D), variablesReference: 0 },
                    { name: "(irq disable) I", type: "flag", value: Formatter.formatBit(flags.I), variablesReference: 0 },
                    { name: "(zero) Z",        type: "flag", value: Formatter.formatBit(flags.Z), variablesReference: 0 },
                    { name: "(carry) C",       type: "flag", value: Formatter.formatBit(flags.C), variablesReference: 0 }
                ];

            } else if (DebugVariables.VARIABLES_MEMORY == args.variablesReference) {

                variables = [];

                variables.push(
                    // memory reference 0x0 does not work -- use -1 instead and clamp later
                    { name: "Zeropage", type: "Zeropage ($00-$ff)", value: await session.formatMemory(0x0, 0x100), variablesReference: 0, memoryReference: -1 }
                );

                variables.push(
                    { name: "Stack", type: "Stack ($100-$1ff)", value: await session.formatMemory(0x100, 0x100), variablesReference: 0, memoryReference: 0x100 }
                );

                if (null != debugInfo && null != debugInfo.hasMemBlocks) {

                    for (const memblock of debugInfo.memblocks) {

                        const info = await session.formatSymbol(memblock);
                        const bytes_token = memblock.memory_size == 1 ? "byte" : "bytes";
                        const type_info = memblock.memory_size  + " " + bytes_token + ", start: " + Formatter.formatAddress(memblock.startAddress) + ", end: " + Formatter.formatAddress(memblock.startAddress);

                        variables.push(
                            { name: info.label, type: type_info, value: info.value, variablesReference: 0, memoryReference: memblock.startAddress }
                        );
                    }
                }

            } else if (DebugVariables.VARIABLES_SYMBOLS == args.variablesReference) {

                variables = [];

                if (null != debugInfo && null != debugInfo.hasSymbols) {
                    let symbols = debugInfo.symbols;
                    let unpackedSymbols = await session.unpackSymbols(symbols);
                    if (unpackedSymbols) {
                        for (const unpackedSymbol of unpackedSymbols) {
                            if (null != unpackedSymbol) {

                                if (unpackedSymbol.indexedVariables > 0 && unpackedSymbol.variablesReference != null) {
                                    unpackedSymbol.variablesReference += DebugVariables.VARIABLES_SYMBOLS_MEMBERS_BEGIN;
                                }

                                variables.push(unpackedSymbol);
                            }
                        }
                    }
                }
            } else  if (DebugVariables.VARIABLES_SYSINFO == args.variablesReference) {

                variables = [
                    { name: "Cycles", type: "stat", value: cpuState.cpuInfo.cycles.toString(), variablesReference: 0 },
                    { name: "Cycles Delta", type: "stat", value: cyclesDelta.toString(), variablesReference: 0 },
                    { name: "Cpu Time Delta", type: "stat", value: cpuTimeDelta, variablesReference: 0 },
                    { name: "Opcode", type: "stat", value: Formatter.formatValue(cpuState.cpuInfo.opcode), variablesReference: 0 },
                    { name: "IRQ", type: "stat", value: Formatter.formatU8(cpuState.cpuInfo.irq), variablesReference: 0 },
                    { name: "NMI", type: "stat", value: Formatter.formatU8(cpuState.cpuInfo.nmi), variablesReference: 0 },
                    { name: "Raster Line", type: "stat", value: Formatter.formatValue(cpuState.cpuInfo.rasterLine), variablesReference: 0 },
                    { name: "Raster Cycle", type: "stat", value: Formatter.formatValue(cpuState.cpuInfo.rasterCycle), variablesReference: 0 },
                    { name: "Zero-$00", type: "stat", value: Formatter.formatU8(cpuState.cpuInfo.zero0), variablesReference: 0 },
                    { name: "Zero-$01", type: "stat", value: Formatter.formatU8(cpuState.cpuInfo.zero1), variablesReference: 0 },
                ];

            } else if (args.variablesReference >= DebugVariables.VARIABLES_SPRITES_BEGIN && args.variablesReference <= DebugVariables.VARIABLES_SPRITES_END) {

                const chipState = await stateProvider.getChipState();
                if (chipState) {
                    const vicState = chipState.vic;
                    const vicBase = vicState.baseAddress;
                    const spriteId = (args.variablesReference - DebugVariables.VARIABLES_SPRITES_BEGIN);
                    const s = vicState.sprites[spriteId];

                    variables = [

                        { name: "enabled", type: "stat", value: Formatter.formatBit(s.enabled), variablesReference: 0 },
                        { name: "pointer", type: "stat", value: s.pointer.toString(), variablesReference: 0,  memoryReference: (vicBase + s.pointer * 64).toString()},
                        { name: "x", type: "stat", value: Formatter.formatValue(s.x), variablesReference: 0 },
                        { name: "y", type: "stat", value: Formatter.formatValue(s.y), variablesReference: 0 },
                        { name: "color", type: "stat", value: Formatter.formatValue(s.color), variablesReference: 0 },
                        { name: "multi-color", type: "stat", value: Formatter.formatBit(s.multicolor), variablesReference: 0 },
                        { name: "doubleWidth", type: "stat", value: Formatter.formatBit(s.doubleWidth), variablesReference: 0 },
                        { name: "doubleHeight", type: "stat", value: Formatter.formatBit(s.doubleHeight), variablesReference: 0 },
                        { name: "sprite collision", type: "stat", value: Formatter.formatBit(s.spriteCollision), variablesReference: 0 },
                        { name: "background collision", type: "stat", value: Formatter.formatBit(s.backgroundCollision), variablesReference: 0 }

                    ]

                } else {
                    variables = [];
                }


            } else if (DebugVariables.VARIABLES_SPRITES == args.variablesReference) {

                variables = [];

                const chipState = await stateProvider.getChipState();
                if (chipState) {
                    const vicState = chipState.vic;

                    variables.push(
                        { name: "Multi-Color 1", type: "stat", value: Formatter.formatU8(vicState.spriteColorMulti1), variablesReference: 0 },
                    );

                    variables.push(
                        { name: "Multi-Color 2", type: "stat", value: Formatter.formatU8(vicState.spriteColorMulti2), variablesReference: 0 },
                    );

                    variables.push(
                        { name: "Sprite/Background Priority", type: "stat", value: Formatter.formatU8(vicState.spriteBackgroundPriority), variablesReference: 0 }
                    );

                    for (let i=0; i<8; i++) {
                        const s = vicState.sprites[i];
                        variables.push(
                            { name: "Sprite " + i, type: "stat", value: s.label, variablesReference: DebugVariables.VARIABLES_SPRITES_BEGIN+i }
                        );
                    }
                }

            } else if (DebugVariables.VARIABLES_BASIC_REGISTERS == args.variablesReference) {

                const basicState = await stateProvider.getBasicState();
                if (basicState) {

                    const reg = basicState.getRegisters();

                    variables = [
                        { name: "Current Line", type: "register", value: reg.currentLineNumber.toString(), variablesReference: 0 },
                        { name: "Previous Line", type: "register", value: reg.lastLineNumber.toString(), variablesReference: 0 },
                        { name: "Current Statement", type: "register", value: Formatter.formatAddress(reg.currentStatement), variablesReference: 0, memoryReference: reg.currentStatement },
                        { name: "Current Data Line", type: "register", value: reg.currentDataLine.toString(), variablesReference: 0 },
                        { name: "Current Data Item", type: "register", value: Formatter.formatAddress(reg.currentDataItem), variablesReference: 0, memoryReference: reg.currentDataItem },
                        { name: "Program Start", type: "register", value: Formatter.formatAddress(reg.programAddress), variablesReference: 0, memoryReference: reg.programAddress },
                        { name: "Variables", type: "register", value: Formatter.formatAddress(reg.variablesAddress), variablesReference: 0, memoryReference: reg.variablesAddress },
                        { name: "Arrays", type: "register", value: Formatter.formatAddress(reg.arraysAddress), variablesReference: 0, memoryReference: reg.arraysAddress },
                        { name: "Free RAM Begin", type: "register", value: Formatter.formatAddress(reg.freeRamAddress), variablesReference: 0, memoryReference: reg.freeRamAddress },
                        { name: "Strings", type: "register", value: Formatter.formatAddress(reg.stringsAddress), variablesReference: 0, memoryReference: reg.stringsAddress }
                    ];

                } else {
                    variables = [];
                }

            } else if (DebugVariables.VARIABLES_BASIC_VECTORS == args.variablesReference) {

                const basicState = await stateProvider.getBasicState();
                if (basicState) {
                    const vec = basicState.getVectors();
                    variables = [
                        { name: "Print Error" + (vec.printError != 0xe38b ? "*" : "") , type: "register", value: Formatter.formatAddress(vec.printError), variablesReference: 0 },
                        { name: "Main Loop" + (vec.mainProgramLoop != 0xa483 ? "*" : ""), type: "register", value: Formatter.formatAddress(vec.mainProgramLoop), variablesReference: 0 },
                        { name: "ASCII to Token" + (vec.textToToken != 0xa57c ? "*" : ""), type: "register", value: Formatter.formatAddress(vec.textToToken), variablesReference: 0 },
                        { name: "Token To ASCII" + (vec.tokenToText != 0xa71a ? "*" : ""), type: "register", value: Formatter.formatAddress(vec.tokenToText), variablesReference: 0 },
                        { name: "Execute Next" + (vec.executeNextToken != 0xa7e4 ? "*" : ""), type: "register", value: Formatter.formatAddress(vec.executeNextToken), variablesReference: 0 },
                        { name: "Eval Number" + (vec.evalNumber != 0xae86 ? "*" : ""), type: "register", value: Formatter.formatAddress(vec.evalNumber), variablesReference: 0 }
                    ];

                } else {
                    variables = [];
                }

            } else if (DebugVariables.VARIABLES_BASIC == args.variablesReference) {

                const basicState = await stateProvider.getBasicState();

                variables = [];

                const basicVariables = basicState.getVariables();
                if (basicVariables) {
                    for (const basicVariable of basicVariables) {
                        variables.push({
                            name: basicVariable.name + basicVariable.suffix,
                            type: "globals",
                            value: basicVariable.value,
                            variablesReference: 0
                        });
                    }
                }

                const basicArrays = basicState.getArrays();
                if (basicArrays) {
                    let idx = 0;
                    for (const basicArray of basicArrays) {

                        const info =  "(" + basicArray.sizes.join(",") + ")";
                        let values = "";

                        let valueIdx = 0;
                        while (values.length < 256 && valueIdx < basicArray.values.length) {
                            if (values == "") values += " ["; else values += ", ";
                            values += basicArray.values[valueIdx++];
                        }
                        if (values.length > 0) values += "]";

                        variables.push({
                            name: basicArray.name + basicArray.suffix,
                            type: "globals",
                            value: info + values,
                            indexedVariables: basicArray.elementCount,
                            variablesReference: DebugVariables.VARIABLES_BASIC_ARRAYS_BEGIN + idx
                        });
                        idx++;
                    }
                }

            } else if (DebugVariables.VARIABLES_VIC == args.variablesReference) {

                const chipState = await stateProvider.getChipState();
                if (chipState) {
                    const vicState = chipState.vic;
                    const vicBase = vicState.baseAddress;

                    variables = [
                        { name: "Bank Select", type: "stat", value: vicState.bankSelect.toString(), variablesReference: 0 },
                        { name: "Base Address", type: "stat", value: Formatter.formatAddress(vicBase), variablesReference: 0, memoryReference: vicBase },
                        { name: "Screen Address", type: "stat", value: Formatter.formatAddress(vicBase + vicState.screenAddress), variablesReference: 0, memoryReference: (vicBase + vicState.screenAddress).toString() },
                        { name: "Bitmap Address", type: "stat", value: Formatter.formatAddress(vicBase + vicState.bitmapAddress), variablesReference: 0, memoryReference: (vicBase + vicState.bitmapAddress).toString() },
                        { name: "Charset Address", type: "stat", value: Formatter.formatAddress(vicBase + vicState.charsetAddress), variablesReference: 0, memoryReference: (vicBase + vicState.charsetAddress).toString() },
                        { name: "Raster Line", type: "stat", value: Formatter.formatValue(vicState.rasterLine), variablesReference: 0 },
                        { name: "Extended Color Mode", type: "stat", value: Formatter.formatBit(vicState.extendedColorMode), variablesReference: 0 },
                        { name: "Text Mode", type: "stat", value: Formatter.formatBit(vicState.textMode), variablesReference: 0 },
                        { name: "Bitmap Mode", type: "stat", value: Formatter.formatBit(vicState.bitmapMode), variablesReference: 0 },
                        { name: "Multi-Color Mode", type: "stat", value: Formatter.formatBit(vicState.multicolorMode), variablesReference: 0 },
                        { name: "Display Rows", type: "stat", value: vicState.numRows.toString(), variablesReference: 0 },
                        { name: "Display Columns", type: "stat", value: vicState.numColumns.toString(), variablesReference: 0 },
                        { name: "Scroll-X", type: "stat", value: vicState.scrollX.toString(), variablesReference: 0 },
                        { name: "Scroll-Y", type: "stat", value: vicState.scrollY.toString(), variablesReference: 0 },
                        { name: "Lightpen-X", type: "stat", value: vicState.lightPenX.toString(), variablesReference: 0 },
                        { name: "Lightpen-Y", type: "stat", value: vicState.lightPenY.toString(), variablesReference: 0 },
                        { name: "IRQ Flags", type: "stat", value: Formatter.formatU8(vicState.irqFlags), variablesReference: 0 },
                        { name: "IRQ Mask", type: "stat", value: Formatter.formatU8(vicState.irqMask), variablesReference: 0 },
                        { name: "Border Color", type: "stat", value: Formatter.formatU8(vicState.borderColor), variablesReference: 0 },
                        { name: "Background Color", type: "stat", value: Formatter.formatU8(vicState.backgroundColor), variablesReference: 0 },
                        { name: "Background Multi-Color 1", type: "stat", value: Formatter.formatU8(vicState.backgroundColorMulti1), variablesReference: 0 },
                        { name: "Background Multi-Color 2", type: "stat", value: Formatter.formatU8(vicState.backgroundColorMulti2), variablesReference: 0 },
                        { name: "Background Multi-Color 3", type: "stat", value: Formatter.formatU8(vicState.backgroundColorMulti3), variablesReference: 0 },
                    ];
                } else {
                    variables = [];
                }
            }

        } else if (args.filter == "indexed") {

            if (args.variablesReference >= DebugVariables.VARIABLES_BASIC_ARRAYS_BEGIN &&
                args.variablesReference <= DebugVariables.VARIABLES_BASIC_ARRAYS_END) {

                const arrayIdx = args.variablesReference - DebugVariables.VARIABLES_BASIC_ARRAYS_BEGIN;
                const basicState = await stateProvider.getBasicState();
                const basicArrays = basicState.getArrays();

                if (basicArrays && arrayIdx >= 0 && arrayIdx < basicArrays.length) {
                    const basicArray = basicArrays[arrayIdx];
                    const values = basicArray.values;

                    variables = [];

                    variables.push({
                        name: "length",
                        type: "globals",
                        value: values.length.toString(),
                        variablesReference: 0
                    });

                    let idx = 0;
                    for (const value of values) {
                        idx++;
                        variables.push({
                            name: idx.toString(),
                            type: "globals",
                            value: value,
                            variablesReference: 0
                        });
                    }
                } else {
                    variables = [];
                }
            } else if (
                (args.variablesReference >= DebugVariables.VARIABLES_SYMBOLS_MEMBERS_BEGIN && args.variablesReference <= DebugVariables.VARIABLES_SYMBOLS_MEMBERS_END) || 
                (args.variablesReference >= DebugVariables.VARIABLES_LOCALS_MEMBERS_BEGIN && args.variablesReference <= DebugVariables.VARIABLES_LOCALS_MEMBERS_END)) {

                const isLocal = (args.variablesReference >= DebugVariables.VARIABLES_LOCALS_MEMBERS_BEGIN && args.variablesReference <= DebugVariables.VARIABLES_LOCALS_MEMBERS_END);
                const ofs = isLocal ? DebugVariables.VARIABLES_LOCALS_MEMBERS_BEGIN : DebugVariables.VARIABLES_SYMBOLS_MEMBERS_BEGIN;
                const arrayIdx = args.variablesReference - ofs;

                let symbols = null;

                if (isLocal) {
                    let functionInfo = debugInfo.getFunctionByAddr(cpuState.cpuRegisters.PC);
                    if (null != functionInfo) {
                        symbols = functionInfo.debugSymbols;
                    }
                } else {
                    symbols = debugInfo.symbols;
                }

                const parentSymbol = symbols[arrayIdx];

                if (parentSymbol != null) {
                    variables = [];

                    const numChildren = parentSymbol.num_children || 0;

                    variables.push({
                        name: "length",
                        type: parentSymbol.label,
                        value: numChildren.toString(),
                        variablesReference: 0
                    });

                    if (parentSymbol.data_type == DebugDataType.STRUCT && null != parentSymbol.children) {
                        const key_values = await session.unpackStructureSymbol(parentSymbol);
                        if (null != key_values) {
                            for (const kv of key_values) {
                                variables.push({
                                    name: kv.name,
                                    type: parentSymbol.label,
                                    value: kv.value,
                                    variablesReference: 0
                                });
                            }
                        }

                    } else {
                        const values = await session.unpackArraySymbol(parentSymbol);

                        if (null != values) {
                            let idx = 0;
                            for (const value of values) {
                                idx++;
                                variables.push({
                                    name: idx.toString(),
                                    type: parentSymbol.label,
                                    value: value,
                                    variablesReference: 0
                                });
                            }
                        }

                    }

                }
            }
        }

        response.body = {
            variables: variables
        };
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    DebugVariablesProvider: DebugVariablesProvider
}
