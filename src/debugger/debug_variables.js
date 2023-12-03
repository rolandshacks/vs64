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

const { Utils, Formatter } = require('utilities/utils');

//const { Logger } = require('utilities/logger');
//const logger = new Logger("DebugVariables");

//-----------------------------------------------------------------------------------------------//
// Constants
//-----------------------------------------------------------------------------------------------//

const DebugVariables = {
    VARIABLES_REGISTERS: 0x10000,
    VARIABLES_FLAGS: 0x20000,
    VARIABLES_SYMBOLS: 0x30000,
    VARIABLES_STACK: 0x40000,
    VARIABLES_SYSINFO: 0x50000,
    VARIABLES_VIC: 0x60000,
    VARIABLES_SPRITES: 0x70000,
    VARIABLES_SPRITE_0: 0x70001,
    VARIABLES_SPRITE_1: 0x70002,
    VARIABLES_SPRITE_2: 0x70003,
    VARIABLES_SPRITE_3: 0x70004,
    VARIABLES_SPRITE_4: 0x70005,
    VARIABLES_SPRITE_5: 0x70006,
    VARIABLES_SPRITE_6: 0x70007,
    VARIABLES_SPRITE_7: 0x70008,
    VARIABLES_CIA1: 0x80000,
    VARIABLES_CIA2: 0x90000,
    VARIABLES_SID: 0xA0000,
    VARIABLES_SID_CHANNEL1: 0xA0001,
    VARIABLES_SID_CHANNEL2: 0xA0002,
    VARIABLES_SID_CHANNEL3: 0xA0003,
    VARIABLES_BASIC: 0xB0000,
    VARIABLES_BASIC_REGISTERS: 0xB0001,
    VARIABLES_BASIC_VECTORS: 0xB0002,
    VARIABLES_BASIC_VARIABLES: 0xB0003,
    VARIABLES_BASIC_ARRAYS: 0xB0004,
    VARIABLES_BASIC_ARRAYS_BEGIN: 0xE0000,
    VARIABLES_BASIC_ARRAYS_END: 0xEFFFF
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
                ["BASIC Vectors",     DebugVariables.VARIABLES_BASIC_VECTORS],
            );
        }

        scopes.push(
            ["CPU Registers",           DebugVariables.VARIABLES_REGISTERS],
            ["CPU Flags",               DebugVariables.VARIABLES_FLAGS],
            ["Stack",                   DebugVariables.VARIABLES_STACK],
            ["Symbols",                 DebugVariables.VARIABLES_SYMBOLS],
            ["Stats",                   DebugVariables.VARIABLES_SYSINFO],
            ["Video (VIC)",             DebugVariables.VARIABLES_VIC],
            ["Sprites (VIC)",           DebugVariables.VARIABLES_SPRITES]
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

            if (DebugVariables.VARIABLES_REGISTERS == args.variablesReference) {

                let registers = cpuState.cpuRegisters;

                variables = [
                    { name: "(accumulator) A",      type: "register", value: Formatter.formatByte(registers.A), variablesReference: 0 },
                    { name: "(register) X",         type: "register", value: Formatter.formatByte(registers.X), variablesReference: 0 },
                    { name: "(register) Y",         type: "register", value: Formatter.formatByte(registers.Y), variablesReference: 0 },
                    { name: "(stack pointer) SP",   type: "register", value: Formatter.formatByte(registers.S), variablesReference: 0 },
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

            } else if (DebugVariables.VARIABLES_SYMBOLS == args.variablesReference) {

                variables = [];

                if (null != debugInfo && null != debugInfo._symbols) {

                    let symbols = debugInfo._symbols.values();

                    for (const symbol of symbols) {

                        let info = await session.formatSymbol(symbol);

                        if (symbol.isAddress) {
                            const label = symbol.memory_size ?
                                symbol.name + ": " + symbol.memory_size + " bytes at " + Formatter.formatAddress(symbol.value) :
                                symbol.name + ": " + Formatter.formatAddress(symbol.value);

                            variables.push(
                                {
                                    name: info.label,
                                    type: label,
                                    value: info.value,
                                    variablesReference: 0,
                                    memoryReference: symbol.value
                                }
                            );
                        } else {
                            variables.push(
                                {
                                    name: info.label,
                                    type: (symbol.name + " = " + symbol.value),
                                    value: info.value,
                                    variablesReference: 0
                                }
                            );

                        }
                    }
                }
            } else  if (DebugVariables.VARIABLES_SYSINFO == args.variablesReference) {

                variables = [
                    { name: "Cycles", type: "stat", value: cpuState.cpuInfo.cycles.toString(), variablesReference: 0 },
                    { name: "Cycles Delta", type: "stat", value: cyclesDelta.toString(), variablesReference: 0 },
                    { name: "Cpu Time Delta", type: "stat", value: cpuTimeDelta, variablesReference: 0 },
                    { name: "Opcode", type: "stat", value: Formatter.formatValue(cpuState.cpuInfo.opcode), variablesReference: 0 },
                    { name: "IRQ", type: "stat", value: Formatter.formatByte(cpuState.cpuInfo.irq), variablesReference: 0 },
                    { name: "NMI", type: "stat", value: Formatter.formatByte(cpuState.cpuInfo.nmi), variablesReference: 0 },
                    { name: "Raster Line", type: "stat", value: Formatter.formatValue(cpuState.cpuInfo.rasterLine), variablesReference: 0 },
                    { name: "Raster Cycle", type: "stat", value: Formatter.formatValue(cpuState.cpuInfo.rasterCycle), variablesReference: 0 },
                    { name: "Zero-$00", type: "stat", value: Formatter.formatByte(cpuState.cpuInfo.zero0), variablesReference: 0 },
                    { name: "Zero-$01", type: "stat", value: Formatter.formatByte(cpuState.cpuInfo.zero1), variablesReference: 0 },
                ];

            } else if (args.variablesReference >= DebugVariables.VARIABLES_SPRITE_0 && args.variablesReference <= DebugVariables.VARIABLES_SPRITE_7) {

                const chipState = await stateProvider.getChipState();
                if (chipState) {
                    const vicState = chipState.vic;
                    const vicBase = vicState.baseAddress;
                    const spriteId = (args.variablesReference - DebugVariables.VARIABLES_SPRITE_0);
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
                        { name: "Multi-Color 1", type: "stat", value: Formatter.formatByte(vicState.spriteColorMulti1), variablesReference: 0 },
                    );

                    variables.push(
                        { name: "Multi-Color 2", type: "stat", value: Formatter.formatByte(vicState.spriteColorMulti2), variablesReference: 0 },
                    );

                    variables.push(
                        { name: "Sprite/Background Priority", type: "stat", value: Formatter.formatByte(vicState.spriteBackgroundPriority), variablesReference: 0 }
                    );

                    for (let i=0; i<8; i++) {
                        const s = vicState.sprites[i];
                        variables.push(
                            { name: "Sprite " + i, type: "stat", value: s.label, variablesReference: DebugVariables.VARIABLES_SPRITE_0+i }
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
                        { name: "IRQ Flags", type: "stat", value: Formatter.formatByte(vicState.irqFlags), variablesReference: 0 },
                        { name: "IRQ Mask", type: "stat", value: Formatter.formatByte(vicState.irqMask), variablesReference: 0 },
                        { name: "Border Color", type: "stat", value: Formatter.formatByte(vicState.borderColor), variablesReference: 0 },
                        { name: "Background Color", type: "stat", value: Formatter.formatByte(vicState.backgroundColor), variablesReference: 0 },
                        { name: "Background Multi-Color 1", type: "stat", value: Formatter.formatByte(vicState.backgroundColorMulti1), variablesReference: 0 },
                        { name: "Background Multi-Color 2", type: "stat", value: Formatter.formatByte(vicState.backgroundColorMulti2), variablesReference: 0 },
                        { name: "Background Multi-Color 3", type: "stat", value: Formatter.formatByte(vicState.backgroundColorMulti3), variablesReference: 0 },
                    ];
                } else {
                    variables = [];
                }

            } else  if (DebugVariables.VARIABLES_STACK == args.variablesReference) {

                let stackUsage = 255 - cpuState.cpuRegisters.S;

                variables = [
                    {
                        name: "Stack",
                        type: "stack",
                        value: "(" + (stackUsage) + ")",
                        indexedVariables: stackUsage,
                        variablesReference: DebugVariables.VARIABLES_STACK+1000
                    }
                ];

                if (debugInfo.hasCStack) {

                    const mem = await emu.readMemory(0x02, 0x03);
                    const stackPointer = (mem[1] << 8) + mem[0];

                    variables.push(
                        {
                            name: "C-Stack",
                            type: "stack",
                            value: Formatter.formatAddress(stackPointer),
                            variablesReference: 0,
                            memoryReference: stackPointer
                        }
                    );
                }

            }
        } else if (args.filter == "indexed") {
            if (DebugVariables.VARIABLES_STACK + 1000 == args.variablesReference) {

                let ofs = args.start;
                let count = args.count;

                if (ofs < 0) ofs = 0;
                if (ofs > 255) ofs = 255;
                if (ofs+count > 255) count = 255-ofs;

                variables = [];

                for (let i=ofs; i<ofs+count; i++) {
                    let addr = 0xff-i;
                    let value = await emu.read(0x100+addr, 1);
                    variables.push( {
                        name: "$" + Utils.fmt(addr.toString(16), 2),
                        type: "stack",
                        value: Formatter.formatByte(value),
                        variablesReference: 0
                    });
                }

            } else if (args.variablesReference >= DebugVariables.VARIABLES_BASIC_ARRAYS_BEGIN &&
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
