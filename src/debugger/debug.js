//
// Debug
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

const { Utils } = require('utilities/utils');
const { Logger } = require('utilities/logger');
const { DebugAddressInfo } = require('debugger/debug_info_types');
const { BufferedMemory } = require('debugger/debug_memory');
const { Profiler } = require('debugger/profiler');

const logger = new Logger("Debug");

//-----------------------------------------------------------------------------------------------//
// Memory
//-----------------------------------------------------------------------------------------------//

const MemoryType = {
    Default: 0,
    Cpu: 1,
    Ram: 2,
    Rom: 3,
    Io: 4,
    Cartridge: 5,
    Vdc: 6
};

//-----------------------------------------------------------------------------------------------//
// Registers
//-----------------------------------------------------------------------------------------------//

class CpuRegisters {
    constructor() {
        this.PC = 0;    // program counter
        this.A = 0;     // accumulator
        this.X = 0;     // X register
        this.Y = 0;     // Y register
        this.S = 0;     // stack pointer
    }

    set(PC, A, X, Y, S) {
        this.PC = PC;
        this.A = A;
        this.X = X;
        this.Y = Y;
        this.S = S;
    }
}

class CpuFlags {
    constructor() {
        this.N = 0;     // negative flag
        this.Z = 0;     // zero flag
        this.B = 0;     // break command flag
        this.C = 0;     // carry flag
        this.V = 0;     // overflow flag
        this.I = 0;     // interrupt disable flag
        this.D = 0;     // decimal mode flag
    }

    set(N, Z, B, C, V, I, D) {
        this.N = N;
        this.Z = Z;
        this.B = B;
        this.C = C;
        this.V = V;
        this.I = I;
        this.D = D;
    }
}

class CpuInfo {
    constructor() {
        this.irq = 0;               // irq
        this.nmi = 0;               // non-maskable irq
        this.opcode = 0;            // current opcode
        this.cycles = 0;            // current opcode cycles
        this.callStack = null;      // current call stack
        this.rasterLine = 0;        // current raster line
        this.rasterCycle = 0;       // current raster cycle
        this.zero0 = 0;             // zero page byte $00
        this.zero1 = 0;             // zero page byte $01
    }

    set(irq, nmi, opcode, cycles, callStack, rasterLine, rasterCycle, zero0, zero1) {
        this.irq = irq;
        this.nmi = nmi;
        this.opcode = opcode;
        this.cycles = cycles;
        this.callStack = callStack;
        this.rasterLine = rasterLine;
        this.rasterCycle = rasterCycle;
        this.zero0 = zero0;
        this.zero1 = zero1;
    }
}

class ZeroPageState {
    constructor(bufferedMemory) {
        this._bufferedMemory = bufferedMemory;
        this.processorPortDataDirection = 0x0;
        this.processorPortBits = 0x0;
    }

    decode() {
        const mem = this._bufferedMemory.toSlice(0x0, 256);

        const z = this;
        z.processorPortDataDirection = mem[0x0];
        z.processorPortBits = mem[0x1];

        return true;
    }
}

class CiaState {
    constructor(bufferedMemory, ciaId) {
        this._bufferedMemory = bufferedMemory;
        this.ciaId = ciaId;

        this.dataPortA = 0x0;
        this.dataPortB = 0x0;
        this.dataDirectionA = 0x0;
        this.dataDirectionB = 0x0;
        this.timerA = 0;
        this.timerB = 0;
        this.realtimeClock = 0;
        this.serialShift = 0x0;
        this.irqControlAndStatus = 0x0;
        this.timerControlA = 0x0;
        this.timerControlB = 0x0;
    }

    decode() {
        logger.debug("decode");

        const mem = this._bufferedMemory.toSlice(0xdc00 + this.ciaId * 0x100, 16);

        const c = this;

        c.dataPortA = mem[0x0];
        c.dataPortB = mem[0x1];
        c.dataDirectionA = mem[0x2];
        c.dataDirectionB = mem[0x3];
        c.timerA = mem[0x4] + (mem[0x5]<<8);
        c.timerB = mem[0x6] + (mem[0x7]<<8);
        c.realtimeClock = mem[0xb]*3600 + mem[0xa]*60 + mem[0x9] + mem[0x8]*0.1;
        c.serialShift = mem[0xc];
        c.irqControlAndStatus = mem[0xd];
        c.timerControlA = mem[0xe];
        c.timerControlB = mem[0xf];

        return true;
    }

}

class SpriteInfo {
    constructor() {
        this.enabled = false;
        this.x = 0;
        this.y = 0;
        this.color = 0;
        this.multicolor = false;
        this.doubleWidth = false;
        this.doubleHeight = false;
        this.spriteCollision = false;
        this.backgroundPriority = false;
        this.backgroundCollision = false;
        this.pointer = 0;
        this.label = "";
    }
}

class VicState {
    constructor(bufferedMemory) {
        this._bufferedMemory = bufferedMemory;

        this.bankSelect = 0;
        this.baseAddress = 0x0;

        this.rasterLine = 0;

        this.extendedColorMode = false;
        this.textMode = false;
        this.bitmapMode = false;
        this.screenEnabled = false;
        this.multicolorMode = false;

        this.numRows = 25;
        this.numColumns = 40;

        this.scrollY = 0;
        this.scrollX = 0;

        this.lightPenX = 0;
        this.lightPenY = 0;

        this.screenAddress = 0;
        this.charsetAddress = 0;
        this.bitmapAddress = 0;

        this.irqFlags = 0x0;
        this.irqMask = 0x0;

        this.borderColor = 0x0;
        this.backgroundColor = 0x0;
        this.backgroundColorMulti1 = 0x0;
        this.backgroundColorMulti2 = 0x0;
        this.backgroundColorMulti3 = 0x0;

        this.spriteColorMulti1 = 0x0;
        this.spriteColorMulti2 = 0x0;
        this.spriteBackgroundPriority = 0x0;

        this.sprites = [];
        for (let i=0; i<8; i++) {
            this.sprites.push(new SpriteInfo());
        }

        this.label = "";

    }

    decode(bankSelect) {
        logger.debug("decode");

        const mem = this._bufferedMemory.toSlice(0xd000, 48);

        const v = this;

        v.bankSelect = bankSelect;
        v.baseAddress = bankSelect * 0x4000; // 16 banks

        v.rasterLine = mem[0x12] + ((mem[0x11]&0x80)<<1);

        v.extendedColorMode = (mem[0x11] & 0x40) != 0;
        v.bitmapMode = (mem[0x11] & 0x20) != 0;
        v.textMode = !v.bitmapMode;
        v.screenEnabled =  (mem[0x11] & 0x10) != 0;
        v.multicolorMode = (mem[0x16] & 0x10) != 0;

        v.numRows =  ((mem[0x11] & 0x8) != 0) ? 25 : 24;
        v.numColumns = ((mem[0x16] & 0x8) != 0) ? 40 : 38;

        v.scrollY = mem[0x11] & 0x7;
        v.scrollX = mem[0x16] & 0x7;

        v.lightPenX = mem[0x13];
        v.lightPenY = mem[0x14];

        v.screenAddress = ((mem[0x18] & 0xf0)>>4) * 0x400;
        if (v.bitmapMode) {
            v.charsetAddress = 0x0;
            v.bitmapAddress = ((mem[0x18] & 0x4) != 0) ? 0x2000 : 0x0;
        } else { // text mode
            v.charsetAddress = ((mem[0x18] & 0xe)>>1) * 0x800;
            v.bitmapAddress = 0x0;
        }

        v.irqFlags = mem[0x19];
        v.irqMask = mem[0x1a];
        v.spriteBackgroundPriority = mem[0x1b];

        v.borderColor = mem[0x20]&0xf;
        v.backgroundColor = mem[0x21]&0xf;
        v.backgroundColorMulti1 = mem[0x22]&0xf;
        v.backgroundColorMulti2 = mem[0x23]&0xf;
        v.backgroundColorMulti3 = mem[0x24]&0xf;
        v.spriteColorMulti1 = mem[0x25]&0xf;
        v.spriteColorMulti2 = mem[0x26]&0xf;

        const spriteAddressRegisters = v.baseAddress + v.screenAddress + 0x03f8;

        for (let i=0; i<8; i++) {
            const mask = (1<<i);
            const s = v.sprites[i];

            s.x = mem[i*2] + (((mem[0x10]&mask) != 0) ? 256 : 0);
            s.y = mem[i*2+1];
            s.color = mem[0x27+i]&0xf;

            s.enabled = (mem[0x15]&mask) != 0;
            s.backgroundPriority = (mem[0x1b]&mask) != 0;
            s.multicolor = (mem[0x1c]&mask) != 0;
            s.doubleWidth = (mem[0x1d]&mask) != 0;
            s.doubleHeight = (mem[0x17]&mask) != 0;
            s.spriteCollision = (mem[0x1e]&mask) != 0;
            s.backgroundCollision = (mem[0x1f]&mask) != 0;

            s.pointer = this._bufferedMemory.getByte(spriteAddressRegisters+i);

            s.label = (s.enabled ? "on" : "off") + ", x=" + s.x + ", y=" + s.y + ", col=" + s.color;
        }

        v.label = (v.bitmapMode ? "bmp" : "txt") + ":" + v.rasterLine;

        return true;

    }

    setRasterLine(v) {
        this.rasterLine = v;
        this._bufferedMemory.setByte(0xd012, v&0xff);
        this._bufferedMemory.setBit(0xd011, 7, ((v & 0x100) != 0x0 ? 1 : 0));
    }

    setExtendedColorMode(v) {
        this.extendedColorMode = (v ? true : false);
        this._bufferedMemory.setBit(0xd011, 6, v);
    }

    setBitmapMode(v) {
        this.bitmapMode = (v ? true : false);
        this.textMode = !this.bitmapMode;
        this._bufferedMemory.setBit(0xd011, 5, v);
    }

    setTextMode(v) {
        this.textMode = (v ? true : false);
        this.setBitmapMode(!this.textMode);
    }

    setMultiColorMode(v) {
        this.multicolorMode = (v ? true : false);
        this._bufferedMemory.setBit(0xd016, 4, v);
    }

    setScreenEnabled(v) {
        this.screenEnabled = (v ? true : false);
        this._bufferedMemory.setBit(0xd011, 4, v);
    }

    setNumRows(v) {
        this.numRows = (v == 25) ? 25 : 24;
        this._bufferedMemory.setBit(0xd011, 3, (this.numRows == 25));
    }

    setNumCols(v) {
        this.numColumns = (v == 40) ? 40 : 38;
        this._bufferedMemory.setBit(0xd016, 3, (this.numColumns == 40));
    }

    setLightPenX(v) {
        this.lightPenX = v;
        this._bufferedMemory.setByte(0xd013, v);
    }

    setLightPenY(v) {
        this.lightPenY = v;
        this._bufferedMemory.setByte(0xd014, v);
    }

    setScrollX(v) {
        this.scrollX = v;
        const b = this._bufferedMemory.getByte(0xd016) & 0xf8;
        this._bufferedMemory.setByte(0xd016, b | (v & 0x07));
    }

    setScrollY(v) {
        this.scrollY = v;
        const b = this._bufferedMemory.getByte(0xd011) & 0xf8;
        this._bufferedMemory.setByte(0xd011, b | (v & 0x07));
    }

    setBorderColor(v) {
        this.borderColor = v;
        this._bufferedMemory.setNibble(0xd020, false, v);
    }

    setBackgroundColor(v) {
        this.backgroundColor = v;
        this._bufferedMemory.setNibble(0xd021, false, v);
    }

    setBackgroundColorMulti1(v) {
        this.backgroundColorMulti1 = v;
        this._bufferedMemory.setNibble(0xd022, false, v);
    }

    setBackgroundColorMulti2(v) {
        this.backgroundColorMulti2 = v;
        this._bufferedMemory.setNibble(0xd023, false, v);
    }

    setBackgroundColorMulti3(v) {
        this.backgroundColorMulti3 = v;
        this._bufferedMemory.setNibble(0xd024, false, v);
    }

    setSpriteColorMulti1(v) {
        this.spriteColorMulti1 = v;
        this._bufferedMemory.setNibble(0xd025, false, v);
    }

    setSpriteColorMulti2(v) {
        this.spriteColorMulti2 = v;
        this._bufferedMemory.setNibble(0xd026, false, v);
    }

    setScreenAddress(v) {
        this.screenAddress = v;
        const bits = (this.screenAddress / 0x400) & 0x0f;
        this._bufferedMemory.setNibble(0xd018, true, bits);
    }

    setCharsetAddress(v) {
        this.charsetAddress = v;
        const b = this._bufferedMemory.getByte(0xd018) & 0b11110001;
        const bits = ((v / 0x800) & 0x7) << 1;
        this._bufferedMemory.setByte(0xd018, b | bits);
        this.bitmapAddress = ((this._bufferedMemory.getByte(0xd018) & 0x4) != 0) ? 0x2000 : 0x0;
    }

    setBitmapAddress(v) {
        this.bitmapAddress = v;
        const b = this._bufferedMemory.getByte(0xd018) & 0b11110001;
        const bits = (v >= 0x2000) ? 0x4 : 0x0;
        this._bufferedMemory.setByte(0xd018, b | bits);
        this.charsetAddress = ((this._bufferedMemory.getByte(0xd018) & 0xe)>>1) * 0x800;
    }

    setSpriteEnabled(sprite, v) {
        const s = this.sprites[sprite];
        s.enabled = (v ? true : false);
        this._bufferedMemory.setBit(0xd015, sprite, s.enabled);
    }

    setSpriteX(sprite, v) {
        const s = this.sprites[sprite];
        s.x = v;
        this._bufferedMemory.setByte(0xd000 + sprite*2, v);
        this._bufferedMemory.setBit(0xd010, sprite, (v & 0x100) != 0 ? 1 : 0);
    }

    setSpriteY(sprite, v) {
        const s = this.sprites[sprite];
        s.y = v;
        this._bufferedMemory.setByte(0xd000 + sprite*2 + 1, v);
    }

    setSpriteColor(sprite, v) {
        const s = this.sprites[sprite];
        s.color = v;
        this._bufferedMemory.setNibble(0xd027+sprite, false, v);
    }

    setSpriteBackgroundPriority(sprite, v) {
        const s = this.sprites[sprite];
        s.backgroundPriority = (v ? true : false);
        this._bufferedMemory.setBit(0xd01b, sprite, s.backgroundPriority);
    }

    setSpriteMultiColor(sprite, v) {
        const s = this.sprites[sprite];
        s.multicolor = (v ? true : false);
        this._bufferedMemory.setBit(0xd01c, sprite, s.multicolor);
    }

    setSpriteDoubleWidth(sprite, v) {
        const s = this.sprites[sprite];
        s.doubleWidth = (v ? true : false);
        this._bufferedMemory.setBit(0xd01d, sprite, s.doubleWidth);
    }

    setSpriteDoubleHeight(sprite, v) {
        const s = this.sprites[sprite];
        s.doubleHeight = (v ? true : false);
        this._bufferedMemory.setBit(0xd017, sprite, s.doubleHeight);
    }

    setSpriteCollision(sprite, v) {
        const s = this.sprites[sprite];
        s.spriteCollision = (v ? true : false);
        this._bufferedMemory.setBit(0xd01e, sprite, s.spriteCollision);
    }

    setSpriteBackgroundCollision(sprite, v) {
        const s = this.sprites[sprite];
        s.backgroundCollision = (v ? true : false);
        this._bufferedMemory.setBit(0xd01f, sprite, s.backgroundCollision);
    }

    setSpritePointer(sprite, v) {
        const s = this.sprites[sprite];
        s.pointer = v;
        const spriteAddressRegisters = this.baseAddress + this.screenAddress + 0x03f8;
        this._bufferedMemory.setByte(spriteAddressRegisters + sprite, v);
    }

    getSpriteDataAddress(sprite) {
        const s = this.sprites[sprite];
        const pointer = s.pointer; // pointers to 64 byte blocks
        const addr = this.baseAddress +  pointer * 64; // blocks are relative to VIC base address
        return addr;
    }

}

class SidChannel {
    constructor() {
        this.frequency = 0;
        this.pulse = 0;
        this.wave = 0;
        this.attack = 0;
        this.decay = 0;
        this.sustain = 0;
        this.release = 0;
        this.label = "";
    }
}

class SidState {
    constructor(bufferedMemory) {
        this._bufferedMemory = bufferedMemory;

        this.channels = [
            new SidChannel(), new SidChannel(), new SidChannel()
        ];

        this.filterCutOff = 0;
        this.filterMask = 0;
        this.filterResonance = 0;
        this.filterSelect = 0;
        this.volume = 0;
        this.paddleX = 0;
        this.paddleY = 0;
        this.oscillator3Rand = 0;
        this.envelopeGenerator3Output = 0;

        this.label = "";
    }

    decode() {
        logger.debug("decode");

        const mem = this._bufferedMemory.toSlice(0xd400, 29);

        const s = this;

        // read channel settings
        for (let i=0; i<3; i++) {
            const ofs = i * 7;
            const c = s.channels[i];
            c.frequency = mem[ofs+0] + (mem[ofs+1] << 8);
            c.pulse = mem[ofs+2] + ((mem[ofs+3]&0xf) << 8);
            c.control = mem[ofs+4] & 0x0f;
            c.wave = (mem[ofs+4] & 0xf0) >> 4;
            c.attack = (mem[ofs+5]&0xf0)>>4;
            c.decay = mem[ofs+5]&0x0f;
            c.sustain = (mem[ofs+6]&0xf0)>>4;
            c.release = mem[ofs+6]&0x0f;

            c.label = "wave:" + c.wave + ", freq:" + c.frequency;
        }

        s.filterCutOff = (mem[0x15]&0x07) + (mem[0x16]<<3);
        s.filterMask = mem[0x17] & 0x0f;
        s.filterResonance = (mem[0x17]&0xf0) >> 4;
        s.filterSelect = (mem[0x18]&0xf0) >> 4;
        s.volume = mem[0x18]&0x0f;
        s.paddleX = mem[0x19];
        s.paddleY = mem[0x1a];
        s.oscillator3Rand = mem[0x1b];
        s.envelopeGenerator3Output = mem[0x1c];

        s.label = "volume=" + s.volume;

        return true;
    }

    setVolume(v) {
        this.volume = v;
        this._bufferedMemory.setNibble(0xd418, false, v);
    }

    setFilterCutOff(v) {
        this.filterCutOff = v;
        const b = this._bufferedMemory.getByte(0xd415) & 0b11111000;
        this._bufferedMemory.setByte(0xd415, (b | v&0x07));
        this._bufferedMemory.setByte(0xd416, (v>>3));
    }

    setFilterMask(v) {
        this.filterMask = v;
        this._bufferedMemory.setNibble(0xd417, false, v);
    }

    setFilterResonance(v) {
        this.filterResonance = v;
        this._bufferedMemory.setNibble(0xd417, true, v);
    }

    setFilterSelect(v) {
        this.filterSelect = v;
        this._bufferedMemory.setNibble(0xd418, true, v);
    }

    setChannelFrequency(channel, v) {
        const c = this.channels[channel];
        c.frequency = v;
        this._bufferedMemory.setByte(0xd400 + channel*7 + 0, v & 0xff);
        this._bufferedMemory.setByte(0xd400 + channel*7 + 1, (v>>8) & 0xff);
    }

    setChannelPulse(channel, v) {
        const c = this.channels[channel];
        c.pulse = v;
        this._bufferedMemory.setByte(0xd400 + channel*7 + 2, v & 0xff);
        this._bufferedMemory.setNibble(0xd400 + channel*7 + 3, false, (v>>8) & 0xf);
    }

    setChannelControl(channel, v) {
        const c = this.channels[channel];
        c.control = v;
        this._bufferedMemory.setNibble(0xd400 + channel*7 + 4, false, v);
    }

    setChannelWave(channel, v) {
        const c = this.channels[channel];
        c.wave = v;
        this._bufferedMemory.setNibble(0xd400 + channel*7 + 4, true, v);
    }

    setChannelAttack(channel, v) {
        const c = this.channels[channel];
        c.attack = v;
        this._bufferedMemory.setNibble(0xd400 + channel*7 + 5, true, v);
    }

    setChannelDecay(channel, v) {
        const c = this.channels[channel];
        c.decay = v;
        this._bufferedMemory.setNibble(0xd400 + channel*7 + 5, false, v);
    }

    setChannelSustain(channel, v) {
        const c = this.channels[channel];
        c.sustain = v;
        this._bufferedMemory.setNibble(0xd400 + channel*7 + 6, true, v);
    }

    setChannelRelease(channel, v) {
        const c = this.channels[channel];
        c.release = v;
        this._bufferedMemory.setNibble(0xd400 + channel*7 + 6, false, v);
    }
}

const _VARTYPE_INTEGER = 0;
const _VARTYPE_FLOAT = 1;
const _VARTYPE_STRING = 2;

class BasicState {

    constructor(bufferedMemory) {
        this._bufferedMemory = bufferedMemory;

        this._registers = {
            programAddress : 0x0,
            variablesAddress : 0x0,
            arraysAddress : 0x0,
            freeRamAddress : 0x0,
            stringsAddress : 0x0,
            currentLineNumber : 0x0,
            lastLineNumber : 0x0,
            currentStatement : 0x0,
            currentDataLine : 0x0,
            currentDataItem : 0x0
        };

        this._vectors = {
            printError: 0xe38b,
            mainProgramLoop: 0xa483,
            textToToken: 0xa57c,
            tokenToText: 0xa71a,
            executeNextToken: 0xa7e4,
            evalNumber: 0xae86
        };

        this._variables = null;
        this._arrays = null;
    }

    get registers() { return this._registers; }
    get vectors() { return this._vectors; }

    static fromBuffer(bufferedMemory) {
        if (!bufferedMemory) return null;
        const basicState = new BasicState(bufferedMemory);
        if (false == basicState.decode()) return null;
        return basicState;
    }

    decode() {
        // fetch registers from zero page
        const mem = this._bufferedMemory.buffer;

        const regs = this._registers;
        regs.programAddress = mem[0x2b] + (mem[0x2c]<<8);
        regs.variablesAddress = mem[0x2d] + (mem[0x2e]<<8);
        regs.arraysAddress = mem[0x2f] + (mem[0x30]<<8);
        regs.freeRamAddress = mem[0x31] + (mem[0x32]<<8);
        regs.stringsAddress = mem[0x33] + (mem[0x34]<<8);

        // if 0x3a == 0xff --> immediate mode
        regs.currentLineNumber = mem[0x3a] != 0xff ? mem[0x39] + (mem[0x3a]<<8) : 0x0;
        regs.lastLineNumber = mem[0x3b] + (mem[0x3c]<<8);
        regs.currentStatement = mem[0x3d] + (mem[0x3e]<<8) + 1;
        regs.currentDataLine = mem[0x3f] + (mem[0x40]<<8);
        regs.currentDataItem = mem[0x41] + (mem[0x42]<<8);

        let vector_addr = 0x300;
        const vectors = this._vectors;
        vectors.printError = mem[vector_addr] + (mem[vector_addr+1]<<8); vector_addr += 2;
        vectors.mainProgramLoop = mem[vector_addr] + (mem[vector_addr+1]<<8); vector_addr += 2;
        vectors.textToToken = mem[vector_addr] + (mem[vector_addr+1]<<8); vector_addr += 2;
        vectors.tokenToText = mem[vector_addr] + (mem[vector_addr+1]<<8); vector_addr += 2;
        vectors.executeNextToken = mem[vector_addr] + (mem[vector_addr+1]<<8); vector_addr += 2;
        vectors.evalNumber = mem[vector_addr] + (mem[vector_addr+1]<<8); vector_addr += 2;

        return true;
    }

    getRegisters() {
        return this._registers;
    }

    getVariables() {
        if (this._variables) return this._variables;
        if (null == this._bufferedMemory || this._bufferedMemory.empty) return null;

        const mem = this._bufferedMemory.buffer;
        const reg = this._registers;

        const variables = [];
        const numVariables = (reg.arraysAddress - reg.variablesAddress) / 7;
        let addr = reg.variablesAddress;
        for (let i=0; i<numVariables; i++) {
            const basicVariable = BasicState.decodeBasicVariable(mem, addr);
            addr += basicVariable.size;
            variables.push(basicVariable);
        }

        this._variables = variables;
        return variables;
    }

    getArrays() {
        if (this._arrays) return this._arrays;
        if (null == this._bufferedMemory || this._bufferedMemory.empty) return null;

        const mem = this._bufferedMemory.buffer;
        const reg = this._registers;

        const arraysStart = reg.arraysAddress;
        const arraysEnd = reg.freeRamAddress;

        const arrays = [];
        let addr = arraysStart;
        while (addr < arraysEnd) {
            const basicArray = BasicState.decodeBasicArray(mem, addr);
            addr += basicArray.size;
            arrays.push(basicArray);
        }

        this._arrays = arrays;
        return arrays;
    }

    static decodeBasicFloat(mem, ofs) {
        let floatValue = null;

        const e = mem[ofs];

        if (e == 0x0) return 0.0;

        const m4 = mem[ofs+1];
        const m3 = mem[ofs+2];
        const m2 = mem[ofs+3];
        const m1 = mem[ofs+4];

        let mantissaBits = ((m4 | 0x80) << 24) + (m3 << 16) + (m2 << 8) + m1;

        const exponent = e - 129; // excess-128 representation
        const sign = (m4 >= 128) ? -1.0 : 1.0

        let divisor = 0x80000000;
        let mantissa = 0.0;
        while (divisor != 0x0 && mantissaBits != 0x0) {
            if ((mantissaBits & 0x1) != 0x0) {
                mantissa += 1.0 / divisor;
            }
            mantissaBits >>>= 1;
            divisor >>>= 1;
        }

        floatValue = (sign * mantissa * Math.pow(2, exponent));

        return floatValue;
    }

    getVectors() {
        return this._vectors;
    }

    static decodeBasicVariableInfo(mem, ofs) {

        let type = null;
        let suffix = "";

        if ((mem[ofs] & 0x80) != 0 && (mem[ofs+1] & 0x80) != 0) {
            // integer
            type = _VARTYPE_INTEGER;
            suffix = "%";

        } else if ((mem[ofs] & 0x80) == 0 && (mem[ofs+1] & 0x80) != 0) {
            // string
            type = _VARTYPE_STRING;
            suffix = "$";
        } else {
            // real
            type = _VARTYPE_FLOAT;
        }

        const name = String.fromCharCode(
            mem[ofs]&0x7f) + ((mem[ofs+1]&0x7f) != 0x0 ? String.fromCharCode(mem[ofs+1]&0x7f) : ""
        );

        const variable = {
            name: name,
            type: type,
            suffix: suffix,
            value: null,
            size: 2
        }

        return variable;

    }

    static decodeBasicString(mem, ofs) {
        const strlen = mem[ofs];
        const strptr = (mem[ofs+2]<<8) + mem[ofs+1];

        let value = "";
        for (let i=0; i<strlen; i++) {
            const c = mem[strptr + i];
            value += String.fromCharCode(c);
        }

        return value;

    }

    static decodeBasicVariable(mem, ofs) {

        const variable = BasicState.decodeBasicVariableInfo(mem, ofs);
        if (null == variable) return null;

        let value = null;

        if (variable.type == _VARTYPE_INTEGER) {
            // int number
            value = ((mem[ofs+2]<<8) + mem[ofs+3]).toString();
        } else if (variable.type == _VARTYPE_FLOAT) {
            // real number
            value = (Math.round(BasicState.decodeBasicFloat(mem, ofs+2) * 10000000.0) / 10000000.0).toString();
        } else if (variable.type == _VARTYPE_STRING) {
            // string
            value = "'" + BasicState.decodeBasicString(mem, ofs+2) + "'";
        } else {
            value = "";
        }

        variable.size += 5;
        variable.value = value;

        return variable;
    }

    static decodeBasicArray(mem, ofs) {

        const variable = BasicState.decodeBasicVariableInfo(mem, ofs); ofs += 2;
        if (null == variable) return null;

        const offsetToNext = ((mem[ofs+1]<<8) + mem[ofs]); ofs += 2;
        const dimensions = mem[ofs]; ofs += 1;

        let elementCount = 1;
        const sizes = [];
        for (let i=0; i<dimensions; i++) {
            const dimensionElementCount = (mem[ofs]<<8) + mem[ofs+1];
            ofs += 2;
            sizes.push(dimensionElementCount);
            elementCount *= dimensionElementCount;
        }

        const values = [];

        for (let i=0; i<elementCount; i++) {
            if (variable.type == _VARTYPE_INTEGER) {
                values.push(((mem[ofs]<<8) + mem[ofs+1]).toString());
                ofs += 2;
            } else if (variable.type == _VARTYPE_FLOAT) {
                values.push((Math.round(BasicState.decodeBasicFloat(mem, ofs) * 10000000.0) / 10000000.0).toString());
                ofs += 5;
            } else if (variable.type == _VARTYPE_STRING) {
                values.push("'" + BasicState.decodeBasicString(mem, ofs) + "'");
                ofs += 3;
            }
        }

        variable.size += offsetToNext - 2;
        variable.dimensions = dimensions;
        variable.sizes = sizes;
        variable.elementCount = elementCount;
        variable.values = values;

        return variable;
    }

}

BasicState.VARTYPE_INTEGER = _VARTYPE_INTEGER;
BasicState.VARTYPE_FLOAT = _VARTYPE_FLOAT;
BasicState.VARTYPE_STRING = _VARTYPE_STRING;

class ChipState {
    constructor(bufferedMemory) {
        this._bufferedMemory = bufferedMemory;
        this.zero = new ZeroPageState(bufferedMemory);
        this.cia1 = new CiaState(bufferedMemory, 0);
        this.cia2 = new CiaState(bufferedMemory, 1);
        this.vic = new VicState(bufferedMemory);
        this.sid = new SidState(bufferedMemory);
    }

    static fromBuffer(bufferedMemory) {
        if (!bufferedMemory) return null;

        const c = new ChipState(bufferedMemory);
        if (false == c.decode()) return null;
        return c;
    }

    decode() {

        if (false == this.zero.decode()) return false;

        if (false == this.cia1.decode()) return false;
        if (false == this.cia2.decode()) return false;

        const bankSelect = 3 - (this.cia2.dataPortA & 0x3);
        if (false == this.vic.decode( bankSelect)) return false;

        if (false == this.sid.decode()) return false;

        return true;
    }

    flush() {
        if (null != this._bufferedMemory) {
            this._bufferedMemory.flush();
        }
    }
}

//-----------------------------------------------------------------------------------------------//
// Cpu State
//-----------------------------------------------------------------------------------------------//

class CpuState {
    constructor() {
        this.cpuRegisters = new CpuRegisters();
        this.cpuFlags = new CpuFlags();
        this.cpuInfo = new CpuInfo();
    }
}

//-----------------------------------------------------------------------------------------------//
// Breakpoint
//-----------------------------------------------------------------------------------------------//

class Breakpoint extends DebugAddressInfo {
    constructor(address, addressEnd, source, line, logMessage) {
        super(address, addressEnd, source, line);
        this.logMessage = logMessage;
        this.key = this.generateKey();
        this.isBasic = false;
        this.basicBreakpoints = null;
    }

    generateKey() {
        return this.address; // address should be unique
    }

}

//-----------------------------------------------------------------------------------------------//
// Breakpoints
//-----------------------------------------------------------------------------------------------//

class Breakpoints {
    constructor() {
        this._breakpoints = [];
    }

    get elements() {
        return this._breakpoints;
    }

    get length() {
        return this.elements.length;
    }

    empty() {
        return this.length < 1;
    }

    clear() {
        this._breakpoints.splice(0);
    }

    at(index) {
        if (index < 0 || index >= this.length) return null;
        return this.elements[index];
    }

    findByAddress(address, start) {
        let breakpoint = null;
        let idx = start||0;
        while (idx < this.length) {
            breakpoint = this.at(idx);
            if (null != breakpoint &&
                address >= breakpoint.address &&
                address <= breakpoint.address_end) {
                return breakpoint;
            }
            idx++;
        }

        return null;
    }

    nextByAddress(address, start) {
        let breakpoint = null;
        let idx = start||0;
        while (idx < this.length) {
            breakpoint = this.at(idx);
            if (null == breakpoint || breakpoint.address >= address) {
                break;
            }
            idx++;
        }

        return idx;
    }

    add(breakpoint) {
        const breakpoints = this._breakpoints;
        let idx = breakpoints.length;
        while (idx > 0) {
            if (breakpoint.address >= breakpoints[idx-1].address) {
                break;
            }
            idx--;
        }
        breakpoints.splice(idx, 0, breakpoint);
    }

    remove(breakpoint) {
        const breakpoints = this._breakpoints;
        let idx = 0;
        while (idx < breakpoints.length) {
            if (breakpoints[idx].key == breakpoint.key) {
                breakpoints.splice(idx, 1);
                break;
            }
            idx++;
        }
    }

}

//-----------------------------------------------------------------------------------------------//
// Debug Interface
//-----------------------------------------------------------------------------------------------//

class DebugInterface {
    constructor(session) {
        this._session = session;
        this._settings = session._settings;
        this._basicMode = session._isBasic;
        this._eventMap = null;
        this._profiler = new Profiler(this);
        this.init();
    }

    init() {
        this._running = false;
        this._prg = null;
    }

    unregisterAllListeners() {
        this._eventMap = null;
    }

    on(eventName, eventFunction) {
        if (null == this._eventMap) {
            this._eventMap = [];
        }

        this._eventMap[eventName] = eventFunction;
    }

    fireEvent(eventName, arg1, arg2, arg3) {

        if (eventName == 'stopped') {
            this.onStopped();
        }

        if (null == this._eventMap) return null;

        let eventFunction = this._eventMap[eventName];
        if (null == eventFunction) return null;

        return eventFunction(arg1, arg2, arg3);
    }

    setBreakpoints(_breakpoints_) {}

    onStopped() {
        this._running = false;
    }

    start() {
        this._profiler.reset();
        this._running = true;
    }

    resume() {
        this._running = true;
    }

    pause() {
        this._running = false;
    }

    stop() {
        this._running = false;
    }

    async step(debugStepType) {
        this._profiler.reset();
        this._running = true;
        await this.do_step(debugStepType);
    }

    async do_step(_debugStepType_) {}

    async read(_addr_, _size_) {
        return 0x0;
    }

    async write(_addr_, _value_) {}

    async loadProgram(_filename_, _autoOffsetCorrection_, _forcedStartAddress_) {
        this.init();
    }

    getCpuState() {
        return null;
    }

    hasMemoryType(_memoryType) {
        return true;
    }

    async readMemory(_startAddress_, _endAddress_, _memoryType) {
        return null;
    }

    async getBufferedMemory(startAddress, endAddress) {
        return await BufferedMemory.alloc(this, startAddress, endAddress);
    }

}

//-----------------------------------------------------------------------------------------------//
// Debug Step Type
//-----------------------------------------------------------------------------------------------//

const DebugStepType = {
    UNKNOWN: 0,
    STEP_IN: 1,
    STEP_OVER: 2,
    STEP_OUT: 3,
    STEP_TO_ADDRESS: 4
};

//-----------------------------------------------------------------------------------------------//
// Debug Interrupt Reason
//-----------------------------------------------------------------------------------------------//

const DebugInterruptReason = {
    UNKNOWN: 0,
    EXIT: 1,
    YIELD: 2,
    INTERRUPTED: 3,
    BREAKPOINT: 4,
    BREAK: 5,
    PAUSE: 6,
    FAILED: 7
};

//-----------------------------------------------------------------------------------------------//
// DebugProcess
//-----------------------------------------------------------------------------------------------//

class DebugProcess {
    constructor(sessionInfo) {
        this._sessionInfo = sessionInfo;
        this._proc = null;
        this._supportsRelaunch = false;
    }

    disableEvents() {
        if (this._proc) {
            // turn off event handling
            this._proc.options.onexit = undefined;
            this._proc.options.onstdout = undefined;
            this._proc.options.onstderr = undefined;
        }
    }

    get supportsRelaunch() {
        return this._supportsRelaunch;
    }

    get alive() {
        return (this._proc && !this._proc.exited);
    }

    stdout(data) {
        if (!data) return;
        logger.debug(data);
    }

    stderr(data) {
        if (!data) return;
        logger.debug(data);
    }

    async spawn_exec(executable, args, options) {

        if (this.alive) {
            this.kill();
        }

        args ||= [];

        const instance = this;

        let proc = null;

        try {
            proc = await Utils.exec(
                executable,
                args,
                {
                    sync: false,
                    onexit:
                        (proc) => {
                            if (options && options.onexit) options.onexit(proc)
                        },
                    onstdout:
                        (data) => {
                            instance.stdout(data);
                            if (options && options.onstdout) options.onstdout(data);
                        },
                    onstderr:
                        (data) => {
                            instance.stderr(data);
                            if (options && options.onstderr) options.onstderr(data);
                        }
                }
            );
        } catch (procInfo) {
            //const txt = (err.code == "ENOENT") ?
            //"executable not found: '" + executable + "'" :
            //"failed to spawn process '" + executable + ": " + err.code;

            throw("failed to create emulator process \"" + executable + "\"" + (procInfo.errorInfo ? " (" + procInfo.errorInfo.code + ")" : ""));
        }

        if (proc && !proc.exited) {
            proc.options = options;
            this._proc = proc;
        }
    }

    kill() {
        if (this._proc) {
            const procInfo = this._proc;
            this._proc = null;
            if (procInfo.process) {
                procInfo.process.kill();
            }
        }

    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    DebugProcess: DebugProcess,
    DebugStepType: DebugStepType,
    DebugInterface: DebugInterface,
    DebugInterruptReason: DebugInterruptReason,
    CpuRegisters: CpuRegisters,
    CpuFlags: CpuFlags,
    CpuInfo: CpuInfo,
    CpuState: CpuState,
    Breakpoint: Breakpoint,
    Breakpoints: Breakpoints,
    ChipState: ChipState,
    BasicState: BasicState,
    SpriteInfo: SpriteInfo,
    MemoryType: MemoryType
}
