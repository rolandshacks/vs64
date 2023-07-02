//
// Debug
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

const { Logger } = require('utilities/logger');
const { DebugAddressInfo } = require('debugger/debug_info');
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
    Cartridge: 5
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

class CiaState {
    constructor(ciaId) {
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

    decode(memorySnapshot) {
        logger.debug("decode");

        const mem = memorySnapshot.subarray(0xdc00 + this.ciaId * 0x100, 0xdc0f + this.ciaId * 0x100);

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
        this.backgroundCollision = false;
        this.pointer = 0;
        this.label = "";
    }
}

class VicState {
    constructor() {

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

    decode(memorySnapshot, bankSelect) {
        logger.debug("decode");

        const mem = memorySnapshot.subarray(0xd000, 0xd031);

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

        v.borderColor = mem[0x20]&0xf;
        v.backgroundColor = mem[0x21]&0xf;
        v.backgroundColorMulti1 = mem[0x22]&0xf;
        v.backgroundColorMulti2 = mem[0x23]&0xf;
        v.backgroundColorMulti3 = mem[0x24]&0xf;
        v.spriteColorMulti1 = mem[0x25]&0xf;
        v.spriteColorMulti2 = mem[0x26]&0xf;
        v.spriteBackgroundPriority = mem[0x1b];

        const spriteAddressRegisters = v.baseAddress + v.screenAddress + 0x03f8;

        for (let i=0; i<8; i++) {
            const mask = (1<<i);
            const s = v.sprites[i];

            s.x = mem[i*2] + (((mem[0x10]&mask) != 0) ? 256 : 0);
            s.y = mem[i*2+1];
            s.color = mem[0x27+i]&0xf;

            s.enabled = (mem[0x15]&mask) != 0;
            s.multicolor = (mem[0x1c]&mask) != 0;
            s.doubleWidth = (mem[0x1d]&mask) != 0;
            s.doubleHeight = (mem[0x17]&mask) != 0;
            s.spriteCollision = (mem[0x1e]&mask) != 0;
            s.backgroundCollision = (mem[0x1f]&mask) != 0;

            s.pointer = memorySnapshot[spriteAddressRegisters+i];

            s.label = (s.enabled ? "on" : "off") + ", x=" + s.x + ", y=" + s.y + ", col=" + s.color;
        }

        v.label = (v.bitmapMode ? "bmp" : "txt") + ":" + v.rasterLine;

        return true;

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
    }
}

class SidState {
    constructor() {
        this.channels = [
            new SidChannel(), new SidChannel(), new SidChannel()
        ];
        this.cutoff = 0;
        this.resonance = 0;
        this.filter = 0;
        this.volume = 0;
        this.paddleX = 0;
        this.paddleY = 0;
        this.oscillator3Rand = 0;
        this.envelopeGenerator3Output = 0;
    }

    decode(memorySnapshot) {
        logger.debug("decode");

        const mem = memorySnapshot.subarray(0xd400, 0xd41c);

        const s = this;

        // read channel settings
        for (let i=0; i<3; i++) {
            const ofs = i * 7;
            const c = s.channels[i];
            c.frequency = mem[ofs+0] + (mem[ofs+1] << 8);
            c.pulse = mem[ofs+2] + ((mem[ofs+3]&0xf) << 8);
            c.wave = mem[ofs+4];
            c.attack = (mem[ofs+5]&0xf0)>>4;
            c.decay = mem[ofs+5]&0x0f;
            c.sustain = (mem[ofs+6]&0xf0)>>4;
            c.release = mem[ofs+6]&0x0f;
        }

        s.cutoff = (mem[0x15]&0xf) + (mem[0x16]<<4);
        s.resonance = mem[0x17];
        s.filter = (mem[0x18]&0xf0) >> 4;
        s.volume = mem[0x18]&0x0f;

        s.paddleX = mem[0x19];
        s.paddleY = mem[0x1a];
        s.oscillator3Rand = mem[0x1b];
        s.envelopeGenerator3Output = mem[0x1c];

        return true;
    }
}

class ZeroPageState {
    constructor() {
        this.processorPortDataDirection = 0x0;
        this.processorPortBits = 0x0;
    }

    decode(memorySnapshot) {
        logger.debug("decode");

        const mem = memorySnapshot.subarray(0x00, 0xff);

        const z = this;
        z.processorPortDataDirection = mem[0x0];
        z.processorPortBits = mem[0x1];

        return true;
    }

}

class ChipState {
    constructor() {
        this.zero = new ZeroPageState();
        this.cia1 = new CiaState(0);
        this.cia2 = new CiaState(1);
        this.vic = new VicState();
        this.sid = new SidState();
    }

    static fromBytes(memorySnapshot) {
        if (!memorySnapshot) return null;

        const c = new ChipState();
        if (false == c.decode(memorySnapshot)) return null;
        return c;
    }

    decode(memorySnapshot) {
        if (false == this.zero.decode(memorySnapshot)) return false;

        if (false == this.cia1.decode(memorySnapshot)) return false;
        if (false == this.cia2.decode(memorySnapshot)) return false;

        const bankSelect = 3 - (this.cia2.dataPortA & 0x3);
        if (false == this.vic.decode(memorySnapshot, bankSelect)) return false;

        if (false == this.sid.decode(memorySnapshot)) return false;

        return true;
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
// Debug Runner
//-----------------------------------------------------------------------------------------------//

class DebugRunner {
    constructor() {
        this.init();
        this._eventMap = null;
        this._profiler = new Profiler(this);
    }

    init() {
        this._running = false;
        this._prg = null;
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

    async readMemory(_startAddress_, _endAddress_, _memoryType) {
        return null;
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
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    DebugStepType: DebugStepType,
    DebugRunner: DebugRunner,
    DebugInterruptReason: DebugInterruptReason,
    CpuRegisters: CpuRegisters,
    CpuFlags: CpuFlags,
    CpuInfo: CpuInfo,
    CpuState: CpuState,
    Breakpoint: Breakpoint,
    Breakpoints: Breakpoints,
    ChipState: ChipState,
    SpriteInfo: SpriteInfo,
    MemoryType: MemoryType
}
