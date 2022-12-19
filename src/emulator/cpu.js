//
// Emulator MOS 6502
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { CpuRegisters, CpuFlags, CpuInfo, CpuState } = require('debugger/debug');
const CPU6502op = require('./opcodes');

const CallStackSize = 128;

class CPU6502 {
    constructor(mem_read_fn, mem_write_fn) {
        this.PC = 0; // Program counter

	    this.A = 0; this.X = 0; this.Y = 0; this.S = 0; // Registers
	    this.N = 0; this.Z = 1; this.C = 0; this.V = 0; // ALU flags
	    this.I = 0; this.D = 0; this.B = 0; // Other flags
	    this.irq = 0; this.nmi = 0; // IRQ lines

	    this._tmp = 0; this._addr = 0; // Temporary registers
        this._returnReached = false; // called RTS at end of program
	    this._opcode = 0; // Current opcode
	    this._cycleCounter = 0; // Cycles counter

		this.read = mem_read_fn; // Memory read access function
		this.write = mem_write_fn; // Memory write access function

		this._callStack = []; // Call stack buffer
		this.clearCallStack();
    }

	dumpCallStack() {
		const callStack = this._callStack;
		console.log("CALL STACK: " + callStack.length + " entries -------");
		for (let entry of this._callStack) {
			console.log("CALL STACK:    - " + entry);
		}
		console.log("CALL STACK: END --------");
	}

	clearCallStack() {
		this._callStack.length = 0;
	}

	pushCallStack() {
		const callStack = this._callStack;
		if (callStack.length >= CallStackSize) return;
		callStack.push(this.PC);
	}

	popCallStack() {
		const callStack = this._callStack;
		let pc = null;
		if (callStack.length > 0) {
			pc = callStack[callStack.length-1];
			callStack.pop();
		}
		return pc;
	}

	getState() {
        const cpuState = new CpuState();

		cpuState.cpuRegisters.set(
			this.PC,
			this.A,
			this.X,
			this.Y,
			this.S
		);

		cpuState.cpuFlags.set(
			this.N,
			this.Z,
			this.B,
			this.C,
			this.V,
			this.I
		);

		cpuState.cpuInfo.set(
			this.irq,
			this.nmi,
			this._opcode,
			this._cycleCounter,
			this._callStack,
			0,  // (TODO) not supported: raster line
			0,  // (TODO) not supported: raster cycle
			0,  // (TODO) not supported: zero0
			0,  // (TODO) not supported: zero1
		);

		return cpuState;
	}

    ////////////////////////////////////////////////////////////////////////////////
    // CPU control
    ////////////////////////////////////////////////////////////////////////////////

    /**
     * Reset the processor
     */
    reset() {

        this._returnReached = false;

	    this.A = 0; this.X = 0; this.Y = 0; this.S = 0;
	    this.N = 0; this.Z = 1; this.C = 0; this.V = 0;
	    this.I = 0; this.D = 0; this.B = 0;

        this.PC = (this.read(0xFFFD) << 8) | this.read(0xFFFC);
        this._opcode = this.read( this.PC );

		this.clearCallStack();
    }

    /**
     * Execute a single opcode
     */
    step() {
		const opcode = this.read( this.PC );
        if (opcode == 0x20) this.pushCallStack(); // JSR
        this.PC++;
	    CPU6502op[ opcode ]( this );
        if (opcode == 0x60) this.popCallStack(); // RTS
		this._opcode = this.read( this.PC );
    }

    fmt(value) {
        let s = "00"+value.toString(16).toUpperCase();
        return "$" + s.substring(s.length-2);
    }

    /**
     * Log the current cycle count and all registers to console.log
     */
    log(){
        let opcode = this.read( this.PC );
	    let msg = "nPC=" + this.PC.toString(16);
	    msg += " cyc=" + this._cycleCounter;
	    msg += " [" + this.fmt(opcode) + "] ";
	    msg += ( this.C ? "C" : "-");
	    msg += ( this.N ? "N" : "-");
	    msg += ( this.Z ? "Z" : "-");
	    msg += ( this.V ? "V" : "-");
	    msg += ( this.D ? "D" : "-");
	    msg += ( this.I ? "I" : "-");
	    msg += " A=" + this.A.toString(16);
	    msg += " X=" + this.X.toString(16);
	    msg += " Y=" + this.Y.toString(16);
	    msg += " S=" + this.S.toString(16);
	    console.log(msg);
    }

    /**
     * Read a memory location. This function must be overridden with a custom implementation.
     * @param {number} addr - The address to read from.
     */
     //read(addr) { throw new Error('The read method must be overridden'); }

     /**
     * Writa a value to a memory location. This function must be overridden with a custom implementation.
     * @param {number} addr - The address to write to.
     * @param {number} value - The value to write.
     */
     //write(addr, value) { throw new Error('The read method must be overridden'); }

    ////////////////////////////////////////////////////////////////////////////////
    // Subroutines - addressing modes & flags
    ////////////////////////////////////////////////////////////////////////////////

    izx() {
	    let a = (this.read(this.PC++) + this.X) & 0xFF;
	    this._addr = (this.read(a+1) << 8) | this.read(a);
	    this._cycleCounter += 6;
    }

	izyp() {
	    let a = this.read(this.PC++);
	    let paddr = (this.read((a+1) & 0xFF) << 8) | this.read(a);
	    this._addr = (paddr + this.Y);
		this._cycleCounter += 6;
	}

    izy() {
	    let a = this.read(this.PC++);
	    let paddr = (this.read((a+1) & 0xFF) << 8) | this.read(a);
	    this._addr = (paddr + this.Y);
	    if ( (paddr & 0x100) != (this._addr & 0x100) ) {
		    this._cycleCounter += 6;
	    } else {
		    this._cycleCounter += 5;
	    }
    }

    ind() {
	    let a = this.read(this.PC++);
	    a |= (this.read(this.PC++) << 8);
	    this._addr = this.read(a);
	    this._addr |= (this.read( (a & 0xFF00) | ((a + 1) & 0xFF) ) << 8);
	    this._cycleCounter += 6;
    }

    zp() {
	    this._addr = this.read(this.PC++);
	    this._cycleCounter += 3;
    }

    zpx() {
	    this._addr = (this.read(this.PC++) + this.X) & 0xFF;
	    this._cycleCounter += 4;
    }

    zpy() {
	    this._addr = (this.read(this.PC++) + this.Y) & 0xFF;
	    this._cycleCounter += 4;
    }

    imp() {
	    this._cycleCounter += 2;
    }

    imm() {
	    this._addr = this.PC++;
	    this._cycleCounter += 2;
    }

    abs() {
	    this._addr = this.read(this.PC++);
	    this._addr |= (this.read(this.PC++) << 8);
	    this._cycleCounter += 4;
    }

	abxp() {
	    let paddr = this.read(this.PC++);
	    paddr |= (this.read(this.PC++) << 8);
	    this._addr = (paddr + this.X);
		  this._cycleCounter += 5;
    }

    abx() {
	    let paddr = this.read(this.PC++);
	    paddr |= (this.read(this.PC++) << 8);
	    this._addr = (paddr + this.X);
	    if ( (paddr & 0x100) != (this._addr & 0x100) ) {
		    this._cycleCounter += 5;
	    } else {
		    this._cycleCounter += 4;
	    }
    }

    aby() {
	    let paddr = this.read(this.PC++);
	    paddr |= (this.read(this.PC++) << 8);
	    this._addr = (paddr + this.Y);
	    if ( (paddr & 0x100) != (this._addr & 0x100) ) {
		    this._cycleCounter += 5;
	    } else {
		    this._cycleCounter += 4;
	    }
    }

	abyp() {
	    let paddr = this.read(this.PC++);
	    paddr |= (this.read(this.PC++) << 8);
	    this._addr = (paddr + this.Y);
      this._cycleCounter += 5;
    }

    rel() {
	    this._addr = this.read(this.PC++);
	    if (this._addr & 0x80) {
		    this._addr -= 0x100;
	    }
	    this._addr += this.PC;
	    this._cycleCounter += 2;
    }

    rmw() {
	    this.write(this._addr, this._tmp & 0xFF);
	    this._cycleCounter += 2;
    }

    fnz(v) {
	    this.Z = ((v & 0xFF) == 0) ? 1 : 0;
	    this.N = ((v & 0x80) != 0) ? 1 : 0;
    }

    // Borrow
    fnzb(v) {
	    this.Z = ((v & 0xFF) == 0) ? 1 : 0;
	    this.N = ((v & 0x80) != 0) ? 1 : 0;
	    this.C = ((v & 0x100) != 0) ? 0 : 1;
    }

    // Carry
    fnzc(v) {
	    this.Z = ((v & 0xFF) == 0) ? 1 : 0;
	    this.N = ((v & 0x80) != 0) ? 1 : 0;
	    this.C = ((v & 0x100) != 0) ? 1 : 0;
    }

    branch(v) {
	    if (v) {
		    if ( (this._addr & 0x100) != (this.PC & 0x100) ) {
			    this._cycleCounter += 2;
		    } else {
			    this._cycleCounter += 1;
		    }
		    this.PC = this._addr;
	    }
    }

    ////////////////////////////////////////////////////////////////////////////////
    // Subroutines - instructions
    ////////////////////////////////////////////////////////////////////////////////
    adc() {
	    let v = this.read(this._addr);
	    let c = this.C;
	    let r = this.A + v + c;
	    if (this.D) {
		    let al = (this.A & 0x0F) + (v & 0x0F) + c;
		    if (al > 9) al += 6;
		    let ah = (this.A >> 4) + (v >> 4) + ((al > 15) ? 1 : 0);
		    this.Z = ((r & 0xFF) == 0) ? 1 : 0;
		    this.N = ((ah & 8) != 0) ? 1 : 0;
		    this.V = ((~(this.A ^ v) & (this.A ^ (ah << 4)) & 0x80) != 0) ? 1 : 0;
		    if (ah > 9) ah += 6;
		    this.C = (ah > 15) ? 1 : 0;
		    this.A = ((ah << 4) | (al & 15)) & 0xFF;
	    } else {
		    this.Z = ((r & 0xFF) == 0) ? 1 : 0;
		    this.N = ((r & 0x80) != 0) ? 1 : 0;
		    this.V = ((~(this.A ^ v) & (this.A ^ r) & 0x80) != 0) ? 1 : 0;
		    this.C = ((r & 0x100) != 0) ? 1 : 0;
		    this.A = r & 0xFF;
	    }
    }

    ahx() {
	    this._tmp = ((this._addr >> 8) + 1) & this.A & this.X;
	    this.write(this._addr, this._tmp & 0xFF);
    }

    alr() {
	    this._tmp = this.read(this._addr) & this.A;
	    this._tmp = ((this._tmp & 1) << 8) | (this._tmp >> 1);
	    this.fnzc(this._tmp);
	    this.A = this._tmp & 0xFF;
    }

    anc() {
	    this._tmp = this.read(this._addr);
	    this._tmp |= ((this._tmp & 0x80) & (this.A & 0x80)) << 1;
	    this.fnzc(this._tmp);
	    this.A = this._tmp & 0xFF;
    }

    and() {
	    this.A &= this.read(this._addr);
	    this.fnz(this.A);
    }

    ane() {
	    this._tmp = this.read(this._addr) & this.A & (this.A | 0xEE);
	    this.fnz(this._tmp);
	    this.A = this._tmp & 0xFF;
    }

    arr() {
	    this._tmp = this.read(this.adfdr) & this.A;
	    this.C = ((this._tmp & 0x80) != 0);
	    this.V = ((((this._tmp >> 7) & 1) ^ ((this._tmp >> 6) & 1)) != 0);
	    if (this.D) {
		    let al = (this._tmp & 0x0F) + (this._tmp & 1);
		    if (al > 5) al += 6;
		    let ah = ((this._tmp >> 4) & 0x0F) + ((this._tmp >> 4) & 1);
		    if (ah > 5) {
			    al += 6;
			    this.C = true;
		    } else {
			    this.C = false;
		    }
		    this._tmp = (ah << 4) | al;
	    }
	    this.fnz(this._tmp);
	    this.A = this._tmp & 0xFF;
    }

    asl() {
	    this._tmp = this.read(this._addr) << 1;
	    this.fnzc(this._tmp);
	    this._tmp &= 0xFF;
    }
    asla() {
	    this._tmp = this.A << 1;
	    this.fnzc(this._tmp);
	    this.A = this._tmp & 0xFF;
    }

    bit() {
	    this._tmp = this.read(this._addr);
	    this.N = ((this._tmp & 0x80) != 0) ? 1 : 0;
	    this.V = ((this._tmp & 0x40) != 0) ? 1 : 0;
	    this.Z = ((this._tmp & this.A) == 0) ? 1 : 0;
    }

    brk() {
	    this.PC++;
	    this.write(this.S + 0x100, this.PC >> 8);
	    this.S = (this.S - 1) & 0xFF;
	    this.write(this.S + 0x100, this.PC & 0xFF);
        this.S = (this.S - 1) & 0xFF;
        this.B = 1; // set break flag
	    let v = this.N << 7;
	    v |= this.V << 6;
	    v |= 1 << 5;
	    v |= this.B << 4;
	    v |= this.D << 3;
	    v |= this.I << 2;
	    v |= this.Z << 1;
	    v |= this.C;
	    this.write(this.S + 0x100, v);
	    this.S = (this.S - 1) & 0xFF;
	    this.I = 1;
	    this.D = 0;
	    this.PC = (this.read(0xFFFF) << 8) | this.read(0xFFFE);
	    this._cycleCounter += 5;
    }

    bcc() { this.branch( this.C == 0 ); }
    bcs() { this.branch( this.C == 1 ); }
    beq() { this.branch( this.Z == 1 ); }
    bne() { this.branch( this.Z == 0 ); }
    bmi() { this.branch( this.N == 1 ); }
    bpl() { this.branch( this.N == 0 ); }
    bvc() { this.branch( this.V == 0 ); }
    bvs() { this.branch( this.V == 1 ); }

    clc() { this.C = 0; }
    cld() { this.D = 0; }
    cli() { this.I = 0; }
    clv() { this.V = 0; }

    cmp() {
	    this.fnzb( this.A - this.read(this._addr) );
    }

    cpx() {
	    this.fnzb( this.X - this.read(this._addr) );
    }

    cpy() {
	    this.fnzb( this.Y - this.read(this._addr) );
    }

    dcp() {
	    this._tmp = (this.read(this._addr) - 1) & 0xFF;
	    this._tmp = this.A - this._tmp;
	    this.fnz(this._tmp);
    }

    dec() {
	    this._tmp = (this.read(this._addr) - 1) & 0xFF;
	    this.fnz(this._tmp);
    }

    dex() {
	    this.X = (this.X - 1) & 0xFF;
	    this.fnz(this.X);
    }

    dey() {
	    this.Y = (this.Y - 1) & 0xFF;
	    this.fnz(this.Y);
    }

    eor() {
	    this.A ^= this.read(this._addr);
	    this.fnz(this.A);
    }

    inc() {
	    this._tmp = (this.read(this._addr) + 1) & 0xFF;
	    this.fnz(this._tmp);
    }

    inx() {
	    this.X = (this.X + 1) & 0xFF;
	    this.fnz(this.X);
    }

    iny() {
	    this.Y = (this.Y + 1) & 0xFF;
	    this.fnz(this.Y);
    }

    isc() {
	    let v = (this.read(this._addr) + 1) & 0xFF;
	    let c = 1 - (this.C ? 1 : 0);
	    let r = this.A - v - c;
	    if (this.D) {
		    let al = (this.A & 0x0F) - (v & 0x0F) - c;
		    if (al > 0x80) al -= 6;
		    let ah = (this.A >> 4) - (v >> 4) - ((al > 0x80) ? 1 : 0);
		    this.Z = ((r & 0xFF) == 0);
		    this.N = ((r & 0x80) != 0);
		    this.V = (((this.A ^ v) & (this.A ^ r) & 0x80) != 0);
		    this.C = ((this.r & 0x100) != 0) ? 0 : 1;
		    if (ah > 0x80) ah -= 6;
		    this.A = ((ah << 4) | (al & 15)) & 0xFF;
	    } else {
		    this.Z = ((r & 0xFF) == 0);
		    this.N = ((r & 0x80) != 0);
		    this.V = (((this.A ^ v) & (this.A ^ r) & 0x80) != 0);
		    this.C = ((r & 0x100) != 0) ? 0 : 1;
		    this.A = r & 0xFF;
	    }
    }

    jmp() {
	    this.PC = this._addr;
	    this._cycleCounter--;
    }

    jsr() {
	    this.write(this.S + 0x100, (this.PC - 1) >> 8);
	    this.S = (this.S - 1) & 0xFF;
	    this.write(this.S + 0x100, (this.PC - 1) & 0xFF);
	    this.S = (this.S - 1) & 0xFF;
	    this.PC = this._addr;
	    this._cycleCounter += 2;
    }

    las() {
	    this.S = this.X = this.A = this.read(this._addr) & this.S;
	    this.fnz(this.A);
    }

    lax() {
	    this.X = this.A = this.read(this._addr);
	    this.fnz(this.A);
    }

    lda() {
	    this.A = this.read(this._addr);
	    this.fnz(this.A);
    }

    ldx() {
	    this.X = this.read(this._addr);
	    this.fnz(this.X);
    }

    ldy() {
	    this.Y = this.read(this._addr);
	    this.fnz(this.Y);
    }

    ora() {
	    this.A |= this.read(this._addr);
	    this.fnz(this.A);
    }

    rol() {
	    this._tmp = (this.read(this._addr) << 1) | this.C;
	    this.fnzc(this._tmp);
	    this._tmp &= 0xFF;
    }
    rla() {
	    this._tmp = (this.A << 1) | this.C;
	    this.fnzc(this._tmp);
	    this.A = this._tmp & 0xFF;
    }

    ror() {
	    this._tmp = this.read(this._addr);
	    this._tmp = ((this._tmp & 1) << 8) | (this.C << 7) | (this._tmp >> 1);
	    this.fnzc(this._tmp);
	    this._tmp &= 0xFF;
    }
    rra() {
	    this._tmp = ((this.A & 1) << 8) | (this.C << 7) | (this.A >> 1);
	    this.fnzc(this._tmp);
	    this.A = this._tmp & 0xFF;
    }


    lsr() {
	    this._tmp = this.read(this._addr);
	    this._tmp = ((this._tmp & 1) << 8) | (this._tmp >> 1);
	    this.fnzc(this._tmp);
	    this._tmp &= 0xFF;
    }
    lsra() {
	    this._tmp = ((this.A & 1) << 8) | (this.A >> 1);
	    this.fnzc(this._tmp);
	    this.A = this._tmp & 0xFF;
    }


    nop() { }

    pha() {
	    this.write(this.S + 0x100, this.A);
	    this.S = (this.S - 1) & 0xFF;
	    this._cycleCounter++;
    }

    php() {
	    let v = this.N << 7;
	    v |= this.V << 6;
	    v |= 1 << 5;
	    v |= this.B << 4;
	    v |= this.D << 3;
	    v |= this.I << 2;
	    v |= this.Z << 1;
	    v |= this.C;
	    this.write(this.S + 0x100, v);
	    this.S = (this.S - 1) & 0xFF;
	    this._cycleCounter++;
    }

    pla() {
	    this.S = (this.S + 1) & 0xFF;
	    this.A = this.read(this.S + 0x100);
	    this.fnz(this.A);
	    this._cycleCounter += 2;
    }

    plp() {
	    this.S = (this.S + 1) & 0xFF;
	    this._tmp = this.read(this.S + 0x100);
	    this.N = ((this._tmp & 0x80) != 0) ? 1 : 0;
	    this.V = ((this._tmp & 0x40) != 0) ? 1 : 0;
	    this.B = ((this._tmp & 0x10) != 0) ? 1 : 0;
	    this.D = ((this._tmp & 0x08) != 0) ? 1 : 0;
	    this.I = ((this._tmp & 0x04) != 0) ? 1 : 0;
	    this.Z = ((this._tmp & 0x02) != 0) ? 1 : 0;
	    this.C = ((this._tmp & 0x01) != 0) ? 1 : 0;
	    this._cycleCounter += 2;
    }

    rti() {
	    this.S = (this.S + 1) & 0xFF;
	    this._tmp = this.read(this.S + 0x100);
	    this.N = ((this._tmp & 0x80) != 0) ? 1 : 0;
        this.V = ((this._tmp & 0x40) != 0) ? 1 : 0;
        this.B = 0; // clear break flag
	    this.D = ((this._tmp & 0x08) != 0) ? 1 : 0;
	    this.I = ((this._tmp & 0x04) != 0) ? 1 : 0;
	    this.Z = ((this._tmp & 0x02) != 0) ? 1 : 0;
	    this.C = ((this._tmp & 0x01) != 0) ? 1 : 0;
	    this.S = (this.S + 1) & 0xFF;
	    this.PC = this.read(this.S + 0x100);
	    this.S = (this.S + 1) & 0xFF;
	    this.PC |= this.read(this.S + 0x100) << 8;
	    this._cycleCounter += 4;
    }

    rts() {
        if (this.S == 0xFF) this._returnReached = true;
	    this.S = (this.S + 1) & 0xFF;
	    this.PC = this.read(this.S + 0x100);
	    this.S = (this.S + 1) & 0xFF;
	    this.PC |= this.read(this.S + 0x100) << 8;
	    this.PC++;
	    this._cycleCounter += 4;
    }

    sbc() {
	    let v = this.read(this._addr);
	    let c = 1 - this.C;
	    let r = this.A - v - c;
	    if (this.D) {
		    let al = (this.A & 0x0F) - (v & 0x0F) - c;
		    if (al < 0) al -= 6;
		    let ah = (this.A >> 4) - (v >> 4) - ((al < 0) ? 1 : 0);
		    this.Z = ((r & 0xFF) == 0) ? 1 : 0;
		    this.N = ((r & 0x80) != 0) ? 1 : 0;
		    this.V = (((this.A ^ v) & (this.A ^ r) & 0x80) != 0) ? 1 : 0;
		    this.C = ((r & 0x100) != 0) ? 0 : 1;
		    if (ah < 0) ah -= 6;
		    this.A = ((ah << 4) | (al & 15)) & 0xFF;
	    } else {
		    this.Z = ((r & 0xFF) == 0) ? 1 : 0;
		    this.N = ((r & 0x80) != 0) ? 1 : 0;
		    this.V = (((this.A ^ v) & (this.A ^ r) & 0x80) != 0) ? 1 : 0;
		    this.C = ((r & 0x100) != 0) ? 0 : 1;
		    this.A = r & 0xFF;
	    }
    }

    sbx() {
	    this._tmp = this.read(this._addr) - (this.A & this.X);
	    this.fnzb(this._tmp);
	    this.X = (this._tmp & 0xFF);
    }

    sec() { this.C = 1; }
    sed() { this.D = 1; }
    sei() { this.I = 1; }

    shs() {
	    this._tmp = ((this._addr >> 8) + 1) & this.A & this.X;
	    this.write(this._addr, this._tmp & 0xFF);
	    this.S = (this._tmp & 0xFF);
    }

    shx() {
	    this._tmp = ((this._addr >> 8) + 1) & this.X;
	    this.write(this._addr, this._tmp & 0xFF);
    }

    shy() {
	    this._tmp = ((this._addr >> 8) + 1) & this.Y;
	    this.write(this._addr, this._tmp & 0xFF);
    }

    slo() {
	    this._tmp = this.read(this._addr) << 1;
	    this._tmp |= this.A;
	    this.fnzc(this._tmp);
	    this.A = this._tmp & 0xFF;
    }

    sre() {
	    let v = this.read(this._addr);
	    this._tmp = ((v & 1) << 8) | (v >> 1);
	    this._tmp ^= this.A;
	    this.fnzc(this._tmp);
	    this.A = this._tmp & 0xFF;
    }

    sta() {
	    this.write(this._addr, this.A);
    }

    stx() {
	    this.write(this._addr, this.X);
    }

    sty() {
	    this.write(this._addr, this.Y);
    }

    tax() {
	    this.X = this.A;
	    this.fnz(this.X);
    }

    tay() {
	    this.Y = this.A;
	    this.fnz(this.Y);
    }

    tsx() {
	    this.X = this.S;
	    this.fnz(this.X);
    }

    txa() {
	    this.A = this.X;
	    this.fnz(this.A);
    }

    txs() {
	    this.S = this.X;
    }

    tya() {
	    this.A = this.Y;
	    this.fnz(this.A);
    }
}

////////////////////////////////////////////////////////////////////////////////
// CPU instantiation
////////////////////////////////////////////////////////////////////////////////

module.exports = CPU6502;
