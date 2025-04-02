//
// Debug Variables
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { Formatter } = require('utilities/formatter');
const { DebugDataType } = require('debugger/debug_info_types');

//const { Logger } = require('utilities/logger');
//const logger = new Logger("DebugVariables");

//-----------------------------------------------------------------------------------------------//
// Constants
//-----------------------------------------------------------------------------------------------//

const _variables_begin = 0x0;
const _variables_reserved_range = 0x10000;
const _variables_range_size = 0x10000;
const _variables_num_sprites = 8;
const _variables_num_sid_channels = 3;
const _variables_mask_flags = 0xffff000000;
const _variables_mask_index = 0x0000ffffff;

let _variables_ofs = _variables_begin; // counter to layout enum;

const DebugVariables = {

    // (reserved) default index range for variables
    VARIABLES_BEGIN: (_variables_ofs),
    VARIABLES_END: (_variables_ofs+=_variables_reserved_range),

    // variable scopes
    VARIABLES_SCOPES_BEGIN: (_variables_ofs),
    VARIABLES_SCOPE_REGISTERS: (_variables_ofs++),
    VARIABLES_SCOPE_FLAGS: (_variables_ofs++),
    VARIABLES_SCOPE_SYSINFO: (_variables_ofs++),
    VARIABLES_SCOPE_MEMORY: (_variables_ofs++),
    VARIABLES_SCOPE_SYMBOLS: (_variables_ofs++),
    VARIABLES_SCOPE_VIC: (_variables_ofs++),
    VARIABLES_SCOPE_SPRITES: (_variables_ofs++),
    VARIABLES_SCOPE_SID: (_variables_ofs++),
    VARIABLES_SCOPE_BASIC: (_variables_ofs++),
    VARIABLES_SCOPE_BASIC_REGISTERS: (_variables_ofs++),
    VARIABLES_SCOPE_BASIC_VECTORS: (_variables_ofs++),
    VARIABLES_SCOPE_LOCALS: (_variables_ofs++),

    // sprites variables range
    VARIABLES_SPRITES_BEGIN: (_variables_ofs),
    VARIABLES_SPRITES_END: (_variables_ofs+=_variables_num_sprites),

    // sprites variables range
    VARIABLES_SID_CHANNELS_BEGIN: (_variables_ofs),
    VARIABLES_SID_CHANNELS_END: (_variables_ofs+=_variables_num_sid_channels),

    // basic variables range
    VARIABLES_BASIC_ARRAYS_BEGIN: (_variables_ofs),
    VARIABLES_BASIC_ARRAYS_END: (_variables_ofs+=_variables_range_size),

    // flags
    VARIABLES_FLAG_NONE: 0x0,
    VARIABLES_FLAG_LOCAL: 0x1000000,
    VARIABLES_FLAG_GLOBAL: 0x2000000,

    // masks
    VARIABLES_MASK_FLAGS: (_variables_mask_flags),
    VARIABLES_MASK_INDEX: (_variables_mask_index)
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
                ["BASIC",               DebugVariables.VARIABLES_SCOPE_BASIC],
                ["BASIC Registers",     DebugVariables.VARIABLES_SCOPE_BASIC_REGISTERS],
                ["BASIC Vectors",       DebugVariables.VARIABLES_SCOPE_BASIC_VECTORS],
            );
        }

        scopes.push(
            ["Locals",                  DebugVariables.VARIABLES_SCOPE_LOCALS],
            ["CPU Registers",           DebugVariables.VARIABLES_SCOPE_REGISTERS],
            ["CPU Flags",               DebugVariables.VARIABLES_SCOPE_FLAGS],
            ["Symbols",                 DebugVariables.VARIABLES_SCOPE_SYMBOLS],
            ["Memory",                  DebugVariables.VARIABLES_SCOPE_MEMORY],
            ["Stats",                   DebugVariables.VARIABLES_SCOPE_SYSINFO],
            ["Video (VIC)",             DebugVariables.VARIABLES_SCOPE_VIC],
            ["Sprites (VIC)",           DebugVariables.VARIABLES_SCOPE_SPRITES],
            ["Sound (SID)",             DebugVariables.VARIABLES_SCOPE_SID],
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

        const variableRef = (args.variablesReference & DebugVariables.VARIABLES_MASK_INDEX);
        const variableFlags = (args.variablesReference & DebugVariables.VARIABLES_MASK_FLAGS);

        const requestNamed = (args.filter == null || args.filter == "named");
        const requestScope = (requestNamed && variableRef >= DebugVariables.VARIABLES_SCOPES_BEGIN);

        if (requestScope) {

            if (DebugVariables.VARIABLES_SCOPE_LOCALS == variableRef) {

                variables = await this.getVariables(DebugVariables.VARIABLES_FLAG_LOCAL);

            } else if (DebugVariables.VARIABLES_SCOPE_SYMBOLS == variableRef) {

                variables = await this.getVariables(DebugVariables.VARIABLES_FLAG_GLOBAL);

            } else if (DebugVariables.VARIABLES_SCOPE_REGISTERS == variableRef) {

                let registers = cpuState.cpuRegisters;

                variables = [
                    { name: "(accumulator) A",      type: "register", value: Formatter.formatU8(registers.A), variablesReference: 0 },
                    { name: "(register) X",         type: "register", value: Formatter.formatU8(registers.X), variablesReference: 0 },
                    { name: "(register) Y",         type: "register", value: Formatter.formatU8(registers.Y), variablesReference: 0 },
                    { name: "(stack pointer) SP",   type: "register", value: Formatter.formatU8(registers.S), variablesReference: 0 },
                    { name: "(program counter) PC", type: "register", value: Formatter.formatAddress(registers.PC), variablesReference: 0, memoryReference: registers.PC }
                ];

            } else if (DebugVariables.VARIABLES_SCOPE_FLAGS == variableRef) {

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

            } else if (DebugVariables.VARIABLES_SCOPE_MEMORY == variableRef) {

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

            } else  if (DebugVariables.VARIABLES_SCOPE_SYSINFO == variableRef) {

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

            } else if (DebugVariables.VARIABLES_SCOPE_SPRITES == variableRef) {

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

                    for (let i=0; i<8; i++) {
                        const s = vicState.sprites[i];
                        variables.push(
                            { name: "Sprite " + i, type: "stat", value: s.label, variablesReference: DebugVariables.VARIABLES_SPRITES_BEGIN+i }
                        );
                    }
                }

            } else if (variableRef >= DebugVariables.VARIABLES_SPRITES_BEGIN && variableRef < DebugVariables.VARIABLES_SPRITES_END) {

                const chipState = await stateProvider.getChipState();
                if (chipState) {
                    const vicState = chipState.vic;
                    const vicBase = vicState.baseAddress;
                    const spriteId = (variableRef - DebugVariables.VARIABLES_SPRITES_BEGIN);
                    const s = vicState.sprites[spriteId];

                    variables = [
                        { name: "enabled", type: "stat", value: Formatter.formatBit(s.enabled), variablesReference: 0 },
                        { name: "pointer", type: "stat", value: s.pointer.toString(), variablesReference: 0,  memoryReference: (vicBase + s.pointer * 64).toString()},
                        { name: "x", type: "stat", value: Formatter.formatValue(s.x), variablesReference: 0 },
                        { name: "y", type: "stat", value: Formatter.formatValue(s.y), variablesReference: 0 },
                        { name: "color", type: "stat", value: Formatter.formatValue(s.color), variablesReference: 0 },
                        { name: "multi-color", type: "stat", value: Formatter.formatBit(s.multicolor), variablesReference: 0 },
                        { name: "double width", type: "stat", value: Formatter.formatBit(s.doubleWidth), variablesReference: 0 },
                        { name: "double height", type: "stat", value: Formatter.formatBit(s.doubleHeight), variablesReference: 0 },
                        { name: "sprite collision", type: "stat", value: Formatter.formatBit(s.spriteCollision), variablesReference: 0 },
                        { name: "background collision", type: "stat", value: Formatter.formatBit(s.backgroundCollision), variablesReference: 0 },
                        { name: "background priority", type: "stat", value: Formatter.formatBit(s.backgroundPriority), variablesReference: 0 }
                    ]

                } else {
                    variables = [];
                }

            } else if (DebugVariables.VARIABLES_SCOPE_BASIC == variableRef) {

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

            } else if (DebugVariables.VARIABLES_SCOPE_BASIC_REGISTERS == variableRef) {

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

            } else if (DebugVariables.VARIABLES_SCOPE_BASIC_VECTORS == variableRef) {

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

            } else if (DebugVariables.VARIABLES_SCOPE_SID == variableRef) {

                const chipState = await stateProvider.getChipState();
                if (chipState) {
                    const sidState = chipState.sid;
                    variables = [
                        { name: "Volume", type: "stat", value: Formatter.formatU4(sidState.volume), variablesReference: 0 },
                        { name: "Filter CutOff", type: "stat", value: Formatter.formatU16(sidState.filterCutOff), variablesReference: 0 },
                        { name: "Filter Mask", type: "stat", value: Formatter.formatBitset(sidState.filterMask, 4), variablesReference: 0 },
                        { name: "Filter Resonance", type: "stat", value: Formatter.formatU8(sidState.filterResonance), variablesReference: 0 },
                        { name: "Filter Select", type: "stat", value: Formatter.formatU8(sidState.filterSelect), variablesReference: 0 }
                    ];

                    for (let i=0; i<3; i++) {
                        const c = sidState.channels[i];
                        variables.push(
                            { name: "Channel " + i, type: "stat", value: c.label, variablesReference: DebugVariables.VARIABLES_SID_CHANNELS_BEGIN+i }
                        );
                    }

                } else {
                    variables = [];
                }

            } else if (variableRef >= DebugVariables.VARIABLES_SID_CHANNELS_BEGIN && variableRef < DebugVariables.VARIABLES_SID_CHANNELS_END) {

                const chipState = await stateProvider.getChipState();
                if (chipState) {
                    const sidState = chipState.sid;
                    const channelId = (variableRef - DebugVariables.VARIABLES_SID_CHANNELS_BEGIN);
                    const c = sidState.channels[channelId];

                    variables = [
                        { name: "Wave", type: "stat", value: Formatter.formatU4(c.wave), variablesReference: 0 },
                        { name: "Frequency", type: "stat", value: Formatter.formatU16(c.frequency), variablesReference: 0 },
                        { name: "Pulse", type: "stat", value: Formatter.formatU16(c.pulse), variablesReference: 0 },
                        { name: "Attack", type: "stat", value: Formatter.formatU8(c.attack), variablesReference: 0 },
                        { name: "Decay", type: "stat", value: Formatter.formatU8(c.decay), variablesReference: 0 },
                        { name: "Sustain", type: "stat", value: Formatter.formatU8(c.sustain), variablesReference: 0 },
                        { name: "Release", type: "stat", value: Formatter.formatU8(c.release), variablesReference: 0 },
                        { name: "Control", type: "stat", value: Formatter.formatBitset(c.control, 4), variablesReference: 0 }
                    ];
                } else {
                    variables = [];
                }


            } else if (DebugVariables.VARIABLES_SCOPE_VIC == variableRef) {

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
                        { name: "Background Multi-Color 3", type: "stat", value: Formatter.formatU8(vicState.backgroundColorMulti3), variablesReference: 0 }
                    ];
                } else {
                    variables = [];
                }
            }

        } else { // indexed

            // BASIC arrays

            if (variableRef >= DebugVariables.VARIABLES_BASIC_ARRAYS_BEGIN &&
                variableRef < DebugVariables.VARIABLES_BASIC_ARRAYS_END) {

                const arrayIdx = variableRef - DebugVariables.VARIABLES_BASIC_ARRAYS_BEGIN;
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
            } else {
                // child variables of global or local/function scope
                variables = await this.getVariables(variableFlags, variableRef);
            }
        }

        response.body = {
            variables: variables
        };
    }

    async setVariableRequest(response, args) {

        const session = this._session;
        const stateProvider = session._stateProvider;

        const emu = session._emulator;
        if (!emu) {
            response.success = false;
            response.message = "invalid state";
            return;
        }

        args = args||{};

        //const debugInfo = session._debugInfo;
        //const cpuState = emu.getCpuState();

        const variableRef = (args.variablesReference & DebugVariables.VARIABLES_MASK_INDEX);
        //const variableFlags = (args.variablesReference & DebugVariables.VARIABLES_MASK_FLAGS);
        const requestScope = (variableRef >= DebugVariables.VARIABLES_SCOPES_BEGIN);

        const name = args.name;
        const value_str = args.value;

        const value = this.parseValueStr(value_str);

        let new_value = null;

        if (requestScope) {

            if (DebugVariables.VARIABLES_SCOPE_SID == variableRef) {
                const chipState = await stateProvider.getChipState();
                if (chipState) {
                    new_value = value;
                    const sidState = chipState.sid;
                    if (name == "") { new_value = null; }
                    else if (name == "Volume") { sidState.setVolume(value); }
                    else if (name == "Filter CutOff") { sidState.setFilterCutOff(value); }
                    else if (name == "Filter Mask") { sidState.setFilterMask(value); }
                    else if (name == "Filter Resonance") { sidState.setFilterResonance(value); }
                    else if (name == "Filter Select") { sidState.setFilterSelect(value); }
                    else { new_value = null; }

                    if (null != new_value) {
                        // write changed memory back to emulator
                        await chipState.flush();
                    }
                }

            } else if (variableRef >= DebugVariables.VARIABLES_SID_CHANNELS_BEGIN && variableRef < DebugVariables.VARIABLES_SID_CHANNELS_END) {

                const chipState = await stateProvider.getChipState();
                if (chipState) {
                    new_value = value;
                    const c = (variableRef - DebugVariables.VARIABLES_SID_CHANNELS_BEGIN);
                    const sidState = chipState.sid;

                    if (name == "") { new_value = null; }
                    else if (name == "Wave") { sidState.setChannelWave(c, value); }
                    else if (name == "Frequency") { sidState.setChannelFrequency(c, value); }
                    else if (name == "Pulse") { sidState.setChannelPulse(c, value); }
                    else if (name == "Attack") { sidState.setChannelAttack(c, value); }
                    else if (name == "Decay") { sidState.setChannelDecay(c, value); }
                    else if (name == "Sustain") { sidState.setChannelSustain(c, value); }
                    else if (name == "Release") { sidState.setChannelRelease(c, value); }
                    else if (name == "Control") { sidState.setChannelControl(c, value); }
                    else { new_value = null; }

                    if (null != new_value) {
                        // write changed memory back to emulator
                        await chipState.flush();
                    }
                }

            } else if (DebugVariables.VARIABLES_SCOPE_VIC == variableRef) {
                const chipState = await stateProvider.getChipState();
                if (chipState) {
                    new_value = value;
                    const vicState = chipState.vic;
                    if (name == "") { new_value = null; }
                    else if (name == "Screen Address") { vicState.setScreenAddress(value); }
                    else if (name == "Charset Address") { vicState.setCharsetAddress(value); }
                    else if (name == "Bitmap Address") { vicState.setBitmapAddress(value); }
                    else if (name == "Raster Line") { vicState.setRasterLine(value); }
                    else if (name == "Extended Color Mode") { vicState.setExtendedColorMode(value); }
                    else if (name == "Text Mode") { vicState.setTextMode(value); }
                    else if (name == "Bitmap Mode") { vicState.setBitmapMode(value); }
                    else if (name == "Multi-Color Mode") { vicState.setMultiColorMode(value); }
                    else if (name == "Display Rows") { vicState.setNumRows(value); }
                    else if (name == "Display Columns") { vicState.setNumCols(value); }
                    else if (name == "Scroll-X") { vicState.setScrollX(value); }
                    else if (name == "Scroll-Y") { vicState.setScrollY(value); }
                    else if (name == "Lightpen-X") { vicState.setLightPenX(value); }
                    else if (name == "Lightpen-Y") { vicState.setLightPenY(value); }
                    else if (name == "Border Color") { vicState.setBorderColor(value); }
                    else if (name == "Background Color") { vicState.setBackgroundColor(value); }
                    else if (name == "Background Multi-Color 1") { vicState.setBackgroundColorMulti1(value); }
                    else if (name == "Background Multi-Color 2") { vicState.setBackgroundColorMulti2(value); }
                    else if (name == "Background Multi-Color 3") { vicState.setBackgroundColorMulti3(value); }
                    else { new_value = null; }

                    if (null != new_value) {
                        // write changed memory back to emulator
                        await chipState.flush();
                    }
                }

            } else if (DebugVariables.VARIABLES_SCOPE_SPRITES == variableRef) {
                const chipState = await stateProvider.getChipState();
                if (chipState) {
                    new_value = value;
                    const vicState = chipState.vic;
                    if (name == "") { new_value = null; }
                    else if (name == "Multi-Color 1") { vicState.setSpriteColorMulti1(value); }
                    else if (name == "Multi-Color 2") { vicState.setSpriteColorMulti2(value); }
                    else { new_value = null; }

                    if (null != new_value) {
                        // write changed memory back to emulator
                        await chipState.flush();
                    }
                }
            } else if (variableRef >= DebugVariables.VARIABLES_SPRITES_BEGIN && variableRef < DebugVariables.VARIABLES_SPRITES_END) {

                const sprite = variableRef - DebugVariables.VARIABLES_SPRITES_BEGIN;

                const chipState = await stateProvider.getChipState();
                if (chipState) {
                    new_value = value;
                    const vicState = chipState.vic;
                    if (name == "") { new_value = null; }
                    else if (name == "enabled") { vicState.setSpriteEnabled(sprite, value); }
                    else if (name == "pointer") { vicState.setSpritePointer(sprite, value); }
                    else if (name == "x") { vicState.setSpriteX(sprite, value); }
                    else if (name == "y") { vicState.setSpriteY(sprite, value); }
                    else if (name == "color") { vicState.setSpriteColor(sprite, value); }
                    else if (name == "multi-color") { vicState.setSpriteMultiColor(sprite, value); }
                    else if (name == "double width") { vicState.setSpriteDoubleWidth(sprite, value); }
                    else if (name == "double height") { vicState.setSpriteDoubleHeight(sprite, value); }
                    else if (name == "sprite collision") { vicState.setSpriteCollision(sprite, value); }
                    else if (name == "background collision") { vicState.setSpriteBackgroundCollision(sprite, value); }
                    else if (name == "background priority") { vicState.setSpriteBackgroundPriority(sprite, value); }
                    else { new_value = null; }

                    if (null != new_value) {
                        // write changed memory back to emulator
                        await chipState.flush();
                    }
                }
            }
        }

        if (null == new_value) {
            response.success = false;
            response.message = "could not change value";
            return;
        }

        response.body = {
            value: "*" + new_value,
        };
    }

    parseValueStr(v) {
        if (v == null) return null;
        if (v.length < 1) return 0;

        let num = 0;

        const vlow = v.toLowerCase();

        try {
            if (vlow == "true" || vlow == "on" || vlow == "yes") {
                num = 1;
            } else if (vlow == "false" || vlow == "off" || vlow == "no") {
                num = 0;
            } else if (v.startsWith('%')) {
                num = parseInt(v.substr(1), 2);
            } else if (v.startsWith('0b')) {
                num = parseInt(v.substr(2), 2);
            } else if (v.startsWith('$')) {
                num = parseInt(v.substr(1), 16);
            } else if (v.startsWith('0x')) {
                num = parseInt(v.substr(2), 16);
            } else {
                num = parseInt(v);
            }
        } finally {;}

        if (isNaN(num)) num = 0;

        return num;
    }

    async getVariables(flags, parentRef) {
        const session = this._session;
        const debugInfo = session._debugInfo;

        if (null == debugInfo) {
            return null;
        }

        const isLocal = (flags & DebugVariables.VARIABLES_FLAG_LOCAL) != 0;

        let symbols = null;
        let symbolScope = null; // function scope

        if (isLocal) {
            // local variables (in function scope)
            const emu = session._emulator;
            const cpuState = emu.getCpuState();
            symbolScope = debugInfo.getFunctionByAddr(cpuState.cpuRegisters.PC);
            if (null != symbolScope) {
                symbols = symbolScope.debugSymbols;
            }
        } else {
            // global variables / symbols
            symbols = debugInfo.symbols;
        }

        if (null == symbols) {
            return null;
        }

        if (null == parentRef) {
            // fetch the root level of either global or local/function scope
            return await this.unpackSymbols(symbols, flags, symbolScope);
        }

        return await this.getVariablesOf(parentRef, symbols)
    }

    async getVariablesOf(parentRef, symbols) {

        const session = this._session;

        if (null == parentRef || 0 == parentRef) {
            return null;
        }

        parentRef -= 1; // we have to offset index by 1 to comply with vscode debug adapter spec

        let parentSymbol = symbols[parentRef];
        if (parentSymbol == null) {
            return null;
        }

        let pointerSymbol = null;

        if (parentSymbol.data_type == DebugDataType.POINTER) {
            pointerSymbol = parentSymbol;
            parentSymbol = parentSymbol.type_ref;
            if (parentSymbol == null) {
                return null;
            }
        }

        const numChildren = parentSymbol.num_children || 0;

        const variables = [];

        if (parentSymbol.data_type == DebugDataType.STRUCT) {

            const unpackedMembers = await session.unpackStructureSymbol(parentSymbol, pointerSymbol);

            if (null != unpackedMembers) {
                for (const structMember of unpackedMembers) {
                    variables.push({
                        name: structMember.name,
                        value: structMember.value || "",
                        type: parentSymbol.label,
                        variablesReference: 0
                    })
                }
            }

        } else if (parentSymbol.data_type == DebugDataType.ARRAY) {

            variables.push({
                // add array information first
                name: "length",
                type: parentSymbol.label,
                value: numChildren.toString(),
                variablesReference: 0
            });

            const values = await session.unpackArraySymbol(parentSymbol);

            if (null != values) {
                let idx = 0;
                for (const value of values) {
                    variables.push({
                        name: (idx+1).toString(),
                        type: parentSymbol.label,
                        value: value,
                        variablesReference: 0
                    });
                    idx++;
                }
            }
        }

        return variables;

    }

    async unpackSymbols(symbols, flags, symbolScope) {
        if (null == symbols) {
            return null;
        }

        const session = this._session;

        const unpackedSymbols = await session.unpackSymbols(symbols);
        if (null == unpackedSymbols) {
            return null;
        }

        const variables = [];
        for (const unpackedSymbol of unpackedSymbols) {
            if (null == unpackedSymbol) continue;

            if (unpackedSymbol.variablesReference != null && unpackedSymbol.variablesReference > 0) {
                unpackedSymbol.variablesReference |= flags;
            }

            if (null != symbolScope) {
                if (symbolScope.refId != null) {
                    const refId = symbolScope.refId + 1;
                    unpackedSymbol.valueLocationReference = refId;
                    unpackedSymbol.declarationLocationReference = refId;
                }
            }

            variables.push(unpackedSymbol);
        }

        if (null == variables || variables.length < 1) {
            return null;
        }

        return variables;
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    DebugVariablesProvider: DebugVariablesProvider
}
