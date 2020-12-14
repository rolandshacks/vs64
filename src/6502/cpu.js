var CPU6502op = require('./opcodes');

/**
 * A 6502 processor emulator
 * Commits on Apr 25, 2019 febc5517e7d4841194980cbb54ae723e28402a4e
 */
class CPU6502{
    constructor(){
        this.returnReached = false; // called RTS at end of program

        this.PC = 0; // Program counter

	    this.A = 0; this.X = 0; this.Y = 0; this.S = 0; // Registers
	    this.N = 0; this.Z = 1; this.C = 0; this.V = 0; // ALU flags
	    this.I = 0; this.D = 0; this.B = 0; // Other flags

	    this.irq = 0; this.nmi = 0; // IRQ lines

	    this.tmp = 0; this.addr = 0; // Temporary registers
	    this.opcode = 0; // Current opcode
	    this.cycles = 0; // Cycles counter
    }

    ////////////////////////////////////////////////////////////////////////////////
    // CPU control
    ////////////////////////////////////////////////////////////////////////////////

    /**
     * Reset the processor
     */
    reset() {

        this.returnReached = false;

	    this.A = 0; this.X = 0; this.Y = 0; this.S = 0;
	    this.N = 0; this.Z = 1; this.C = 0; this.V = 0;
	    this.I = 0; this.D = 0; this.B = 0;

        this.PC = (this.read(0xFFFD) << 8) | this.read(0xFFFC);
        this.opcode = this.read( this.PC );
    }

    /**
     * Execute a single opcode
     */
    step() {
	    this.opcode = this.read( this.PC++ );
	    CPU6502op[ this.opcode ]( this );
    }

    fmt(value) {
        var s = "00"+value.toString(16).toUpperCase();
        return "$" + s.substring(s.length-2);
    }

    /**
     * Log the current cycle count and all registers to console.log
     */
    log(){
        var opcode = this.read( this.PC );
	    var msg = "nPC=" + this.PC.toString(16);
	    msg += " cyc=" + this.cycles;
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
     read(addr){
        throw new Error('The read method must be overridden');
     }

     /**
     * Writa a value to a memory location. This function must be overridden with a custom implementation.
     * @param {number} addr - The address to write to.
     * @param {number} value - The value to write.
     */
     write(addr, value){
        throw new Error('The read method must be overridden');
     }

    ////////////////////////////////////////////////////////////////////////////////
    // Subroutines - addressing modes & flags
    ////////////////////////////////////////////////////////////////////////////////

    izx() {
	    var a = (this.read(this.PC++) + this.X) & 0xFF;
	    this.addr = (this.read(a+1) << 8) | this.read(a);
	    this.cycles += 6;
    }

	izyp() {
	    var a = this.read(this.PC++);
	    var paddr = (this.read((a+1) & 0xFF) << 8) | this.read(a);
	    this.addr = (paddr + this.Y);
		  this.cycles += 6;
	}

    izy() {
	    var a = this.read(this.PC++);
	    var paddr = (this.read((a+1) & 0xFF) << 8) | this.read(a);
	    this.addr = (paddr + this.Y);
	    if ( (paddr & 0x100) != (this.addr & 0x100) ) {
		    this.cycles += 6;
	    } else {
		    this.cycles += 5;
	    }
    }

    ind() {
	    var a = this.read(this.PC++);
	    a |= (this.read(this.PC++) << 8);
	    this.addr = this.read(a);
	    this.addr |= (this.read( (a & 0xFF00) | ((a + 1) & 0xFF) ) << 8);
	    this.cycles += 6;
    }

    zp() {
	    this.addr = this.read(this.PC++);
	    this.cycles += 3;
    }

    zpx() {
	    this.addr = (this.read(this.PC++) + this.X) & 0xFF;
	    this.cycles += 4;
    }

    zpy() {
	    this.addr = (this.read(this.PC++) + this.Y) & 0xFF;
	    this.cycles += 4;
    }

    imp() {
	    this.cycles += 2;
    }

    imm() {
	    this.addr = this.PC++;
	    this.cycles += 2;
    }

    abs() {
	    this.addr = this.read(this.PC++);
	    this.addr |= (this.read(this.PC++) << 8);
	    this.cycles += 4;
    }

	abxp() {
	    var paddr = this.read(this.PC++);
	    paddr |= (this.read(this.PC++) << 8);
	    this.addr = (paddr + this.X);
		  this.cycles += 5;
    }

    abx() {
	    var paddr = this.read(this.PC++);
	    paddr |= (this.read(this.PC++) << 8);
	    this.addr = (paddr + this.X);
	    if ( (paddr & 0x100) != (this.addr & 0x100) ) {
		    this.cycles += 5;
	    } else {
		    this.cycles += 4;
	    }
    }

    aby() {
	    var paddr = this.read(this.PC++);
	    paddr |= (this.read(this.PC++) << 8);
	    this.addr = (paddr + this.Y);
	    if ( (paddr & 0x100) != (this.addr & 0x100) ) {
		    this.cycles += 5;
	    } else {
		    this.cycles += 4;
	    }
    }

	abyp() {
	    var paddr = this.read(this.PC++);
	    paddr |= (this.read(this.PC++) << 8);
	    this.addr = (paddr + this.Y);
      this.cycles += 5;
    }

    rel() {
	    this.addr = this.read(this.PC++);
	    if (this.addr & 0x80) {
		    this.addr -= 0x100;
	    }
	    this.addr += this.PC;
	    this.cycles += 2;
    }

    rmw() {
	    this.write(this.addr, this.tmp & 0xFF);
	    this.cycles += 2;
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
		    if ( (this.addr & 0x100) != (this.PC & 0x100) ) {
			    this.cycles += 2;
		    } else {
			    this.cycles += 1;
		    }
		    this.PC = this.addr;
	    }
    }

    ////////////////////////////////////////////////////////////////////////////////
    // Subroutines - instructions
    ////////////////////////////////////////////////////////////////////////////////
    adc() {
	    var v = this.read(this.addr);
	    var c = this.C;
	    var r = this.A + v + c;
	    if (this.D) {
		    var al = (this.A & 0x0F) + (v & 0x0F) + c;
		    if (al > 9) al += 6;
		    var ah = (this.A >> 4) + (v >> 4) + ((al > 15) ? 1 : 0);
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
	    this.tmp = ((this.addr >> 8) + 1) & this.A & this.X;
	    this.write(this.addr, this.tmp & 0xFF);
    }

    alr() {
	    this.tmp = this.read(this.addr) & this.A;
	    this.tmp = ((this.tmp & 1) << 8) | (this.tmp >> 1);
	    this.fnzc(this.tmp);
	    this.A = this.tmp & 0xFF;
    }

    anc() {
	    this.tmp = this.read(this.addr);
	    this.tmp |= ((this.tmp & 0x80) & (this.A & 0x80)) << 1;
	    this.fnzc(this.tmp);
	    this.A = this.tmp & 0xFF;
    }

    and() {
	    this.A &= this.read(this.addr);
	    this.fnz(this.A);
    }

    ane() {
	    this.tmp = this.read(this.addr) & this.A & (this.A | 0xEE);
	    this.fnz(this.tmp);
	    this.A = this.tmp & 0xFF;
    }

    arr() {
	    this.tmp = this.read(this.adfdr) & this.A;
	    this.C = ((this.tmp & 0x80) != 0);
	    this.V = ((((this.tmp >> 7) & 1) ^ ((this.tmp >> 6) & 1)) != 0);
	    if (this.D) {
		    var al = (this.tmp & 0x0F) + (this.tmp & 1);
		    if (al > 5) al += 6;
		    var ah = ((this.tmp >> 4) & 0x0F) + ((this.tmp >> 4) & 1);
		    if (ah > 5) {
			    al += 6;
			    this.C = true;
		    } else {
			    this.C = false;
		    }
		    this.tmp = (ah << 4) | al;
	    }
	    this.fnz(this.tmp);
	    this.A = this.tmp & 0xFF;
    }

    asl() {
	    this.tmp = this.read(this.addr) << 1;
	    this.fnzc(this.tmp);
	    this.tmp &= 0xFF;
    }
    asla() {
	    this.tmp = this.A << 1;
	    this.fnzc(this.tmp);
	    this.A = this.tmp & 0xFF;
    }

    bit() {
	    this.tmp = this.read(this.addr);
	    this.N = ((this.tmp & 0x80) != 0) ? 1 : 0;
	    this.V = ((this.tmp & 0x40) != 0) ? 1 : 0;
	    this.Z = ((this.tmp & this.A) == 0) ? 1 : 0;
    }

    brk() {
	    this.PC++;
	    this.write(this.S + 0x100, this.PC >> 8);
	    this.S = (this.S - 1) & 0xFF;
	    this.write(this.S + 0x100, this.PC & 0xFF);
        this.S = (this.S - 1) & 0xFF;
        this.B = 1; // set break flag
	    var v = this.N << 7;
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
	    this.cycles += 5;
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
	    this.fnzb( this.A - this.read(this.addr) );
    }

    cpx() {
	    this.fnzb( this.X - this.read(this.addr) );
    }

    cpy() {
	    this.fnzb( this.Y - this.read(this.addr) );
    }

    dcp() {
	    this.tmp = (this.read(this.addr) - 1) & 0xFF;
	    this.tmp = this.A - this.tmp;
	    this.fnz(this.tmp);
    }

    dec() {
	    this.tmp = (this.read(this.addr) - 1) & 0xFF;
	    this.fnz(this.tmp);
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
	    this.A ^= this.read(this.addr);
	    this.fnz(this.A);
    }

    inc() {
	    this.tmp = (this.read(this.addr) + 1) & 0xFF;
	    this.fnz(this.tmp);
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
	    var v = (this.read(this.addr) + 1) & 0xFF;
	    var c = 1 - (this.C ? 1 : 0);
	    var r = this.A - v - c;
	    if (this.D) {
		    var al = (this.A & 0x0F) - (v & 0x0F) - c;
		    if (al > 0x80) al -= 6;
		    var ah = (this.A >> 4) - (v >> 4) - ((al > 0x80) ? 1 : 0);
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
	    this.PC = this.addr;
	    this.cycles--;
    }

    jsr() {
	    this.write(this.S + 0x100, (this.PC - 1) >> 8);
	    this.S = (this.S - 1) & 0xFF;
	    this.write(this.S + 0x100, (this.PC - 1) & 0xFF);
	    this.S = (this.S - 1) & 0xFF;
	    this.PC = this.addr;
	    this.cycles += 2;
    }

    las() {
	    this.S = this.X = this.A = this.read(this.addr) & this.S;
	    this.fnz(this.A);
    }

    lax() {
	    this.X = this.A = this.read(this.addr);
	    this.fnz(this.A);
    }

    lda() {
	    this.A = this.read(this.addr);
	    this.fnz(this.A);
    }

    ldx() {
	    this.X = this.read(this.addr);
	    this.fnz(this.X);
    }

    ldy() {
	    this.Y = this.read(this.addr);
	    this.fnz(this.Y);
    }

    ora() {
	    this.A |= this.read(this.addr);
	    this.fnz(this.A);
    }

    rol() {
	    this.tmp = (this.read(this.addr) << 1) | this.C;
	    this.fnzc(this.tmp);
	    this.tmp &= 0xFF;
    }
    rla() {
	    this.tmp = (this.A << 1) | this.C;
	    this.fnzc(this.tmp);
	    this.A = this.tmp & 0xFF;
    }

    ror() {
	    this.tmp = this.read(this.addr);
	    this.tmp = ((this.tmp & 1) << 8) | (this.C << 7) | (this.tmp >> 1);
	    this.fnzc(this.tmp);
	    this.tmp &= 0xFF;
    }
    rra() {
	    this.tmp = ((this.A & 1) << 8) | (this.C << 7) | (this.A >> 1);
	    this.fnzc(this.tmp);
	    this.A = this.tmp & 0xFF;
    }


    lsr() {
	    this.tmp = this.read(this.addr);
	    this.tmp = ((this.tmp & 1) << 8) | (this.tmp >> 1);
	    this.fnzc(this.tmp);
	    this.tmp &= 0xFF;
    }
    lsra() {
	    this.tmp = ((this.A & 1) << 8) | (this.A >> 1);
	    this.fnzc(this.tmp);
	    this.A = this.tmp & 0xFF;
    }


    nop() { }

    pha() {
	    this.write(this.S + 0x100, this.A);
	    this.S = (this.S - 1) & 0xFF;
	    this.cycles++;
    }

    php() {
	    var v = this.N << 7;
	    v |= this.V << 6;
	    v |= 1 << 5;
	    v |= this.B << 4;
	    v |= this.D << 3;
	    v |= this.I << 2;
	    v |= this.Z << 1;
	    v |= this.C;
	    this.write(this.S + 0x100, v);
	    this.S = (this.S - 1) & 0xFF;
	    this.cycles++;
    }

    pla() {
	    this.S = (this.S + 1) & 0xFF;
	    this.A = this.read(this.S + 0x100);
	    this.fnz(this.A);
	    this.cycles += 2;
    }

    plp() {
	    this.S = (this.S + 1) & 0xFF;
	    this.tmp = this.read(this.S + 0x100);
	    this.N = ((this.tmp & 0x80) != 0) ? 1 : 0;
	    this.V = ((this.tmp & 0x40) != 0) ? 1 : 0;
	    this.B = ((this.tmp & 0x10) != 0) ? 1 : 0;
	    this.D = ((this.tmp & 0x08) != 0) ? 1 : 0;
	    this.I = ((this.tmp & 0x04) != 0) ? 1 : 0;
	    this.Z = ((this.tmp & 0x02) != 0) ? 1 : 0;
	    this.C = ((this.tmp & 0x01) != 0) ? 1 : 0;
	    this.cycles += 2;
    }

    rti() {
	    this.S = (this.S + 1) & 0xFF;
	    this.tmp = this.read(this.S + 0x100);
	    this.N = ((this.tmp & 0x80) != 0) ? 1 : 0;
        this.V = ((this.tmp & 0x40) != 0) ? 1 : 0;
        this.B = 0; // clear break flag
	    this.D = ((this.tmp & 0x08) != 0) ? 1 : 0;
	    this.I = ((this.tmp & 0x04) != 0) ? 1 : 0;
	    this.Z = ((this.tmp & 0x02) != 0) ? 1 : 0;
	    this.C = ((this.tmp & 0x01) != 0) ? 1 : 0;
	    this.S = (this.S + 1) & 0xFF;
	    this.PC = this.read(this.S + 0x100);
	    this.S = (this.S + 1) & 0xFF;
	    this.PC |= this.read(this.S + 0x100) << 8;
	    this.cycles += 4;
    }

    rts() {
        if (this.S == 0xFF) this.returnReached = true;
	    this.S = (this.S + 1) & 0xFF;
	    this.PC = this.read(this.S + 0x100);
	    this.S = (this.S + 1) & 0xFF;
	    this.PC |= this.read(this.S + 0x100) << 8;
	    this.PC++;
	    this.cycles += 4;
    }

    sbc() {
	    var v = this.read(this.addr);
	    var c = 1 - this.C;
	    var r = this.A - v - c;
	    if (this.D) {
		    var al = (this.A & 0x0F) - (v & 0x0F) - c;
		    if (al < 0) al -= 6;
		    var ah = (this.A >> 4) - (v >> 4) - ((al < 0) ? 1 : 0);
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
	    this.tmp = this.read(this.addr) - (this.A & this.X);
	    this.fnzb(this.tmp);
	    this.X = (this.tmp & 0xFF);
    }

    sec() { this.C = 1; }
    sed() { this.D = 1; }
    sei() { this.I = 1; }

    shs() {
	    this.tmp = ((this.addr >> 8) + 1) & this.A & this.X;
	    this.write(this.addr, this.tmp & 0xFF);
	    this.S = (this.tmp & 0xFF);
    }

    shx() {
	    this.tmp = ((this.addr >> 8) + 1) & this.X;
	    this.write(this.addr, this.tmp & 0xFF);
    }

    shy() {
	    this.tmp = ((this.addr >> 8) + 1) & this.Y;
	    this.write(this.addr, this.tmp & 0xFF);
    }

    slo() {
	    this.tmp = this.read(this.addr) << 1;
	    this.tmp |= this.A;
	    this.fnzc(this.tmp);
	    this.A = this.tmp & 0xFF;
    }

    sre() {
	    var v = this.read(this.addr);
	    this.tmp = ((v & 1) << 8) | (v >> 1);
	    this.tmp ^= this.A;
	    this.fnzc(this.tmp);
	    this.A = this.tmp & 0xFF;
    }

    sta() {
	    this.write(this.addr, this.A);
    }

    stx() {
	    this.write(this.addr, this.X);
    }

    sty() {
	    this.write(this.addr, this.Y);
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
