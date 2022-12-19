//
// Opcodes
//

//-----------------------------------------------------------------------------------------------//
// Address Modes
//-----------------------------------------------------------------------------------------------//

const AddressMode = {
    imm: 0,  // Immediate - imm
    abs: 1,  // Absolute - abs
    zp: 2,   // Zero Page - zp
    imp: 3,  // Implied
    ind: 4,  // Indirect Absolute - ind
    abx: 5,  // Absolute indexed with X - abx / abs.x
    aby: 6,  // Absolute indexed with Y - aby / abs.y
    zpx: 7,  // Zero page indexed with X - zpx / zp.x
    zpy: 8,  // Zero page indexed with Y - zpy / zp.y
    izx: 9,  // Indexed indirect (with x) - izx / (zp.x)
    izy: 10, // Indirect indexed (with y) - izy / (zp).y
    rel: 11, // Relative - rel
    acc: 12  // Accumulator
};

//-----------------------------------------------------------------------------------------------//
// Instruction Names
//-----------------------------------------------------------------------------------------------//

const InstructionNames = [
    "ADC","AND","ASL","BCC","BCS","BEQ","BIT","BMI","BNE","BPL",
    "BRK","BVC","BVS","CLC","CLD","CLI","CLV","CMP","CPX","CPY",
    "DEC","DEX","DEY","EOR","INC","INX","INY","JMP","JSR","LDA",
    "LDX","LDY","LSR","NOP","ORA","PHA","PHP","PLA","PLP","ROL",
    "ROR","RTI","RTS","SBC","SEC","SED","SEI","STA","STX","STY",
    "TAX","TAY","TSX","TXA","TXS","TYA",

    // from illegal opcodes

    "SLA", "RLA", "ISC", "SRE", "SAX", "RRA", "LAX", "DCP", "ANC",
    "ALR", "ARR", "SBX", "SBC", "LAS", "JAM", "SHA", "SHX", "XAA",
    "SHY", "TAS"
];

//-----------------------------------------------------------------------------------------------//
// Jump Instructions
//-----------------------------------------------------------------------------------------------//

const JumpInstructions = [
    3, 4, 5, 7, 8, 9, 11, 12, 27, 28
];

//-----------------------------------------------------------------------------------------------//
// Opcode Table
//-----------------------------------------------------------------------------------------------//

const OpcodeTable = [
    // num,name,addressing,cycles,cross_page
    [0x69,0,AddressMode.imm,2,1], // ADC
    [0x65,0,AddressMode.zp,3,1],
    [0x75,0,AddressMode.zpx,4,1],
    [0x6D,0,AddressMode.abs,4,1],
    [0x7D,0,AddressMode.abx,4,1],
    [0x79,0,AddressMode.aby,4,1],
    [0x61,0,AddressMode.izx,6,1],
    [0x71,0,AddressMode.izy,5,1],

    [0x29,1,AddressMode.imm,2,1], // AND
    [0x25,1,AddressMode.zp,3,1],
    [0x35,1,AddressMode.zpx,4,1],
    [0x2D,1,AddressMode.abs,4,1],
    [0x3D,1,AddressMode.abx,4,1],
    [0x39,1,AddressMode.aby,4,1],
    [0x21,1,AddressMode.izx,6,1],
    [0x31,1,AddressMode.izy,5,1],

    [0x0A,2,AddressMode.acc,2,0], // ASL
    [0x06,2,AddressMode.zp,5,0],
    [0x16,2,AddressMode.zpx,6,0],
    [0x0E,2,AddressMode.abs,6,0],
    [0x1E,2,AddressMode.abx,6,0],

    [0x90,3,AddressMode.rel,4,1], // BCC

    [0xB0,4,AddressMode.rel,4,1], // BCS

    [0xF0,5,AddressMode.rel,4,1], // BEQ

    [0x24,6,AddressMode.zp,3,0], // BIT
    [0x2C,6,AddressMode.abs,4,0],

    [0x30,7,AddressMode.rel,4,1], // BMI

    [0xD0,8,AddressMode.rel,4,1], // BNE

    [0x10,9,AddressMode.rel,4,1], // BPL

    [0x00,10,AddressMode.imp,7,0], // BRK

    [0x50,11,AddressMode.rel,4,1], // BVC

    [0x70,12,AddressMode.rel,4,1], // BVS

    [0x18,13,AddressMode.imp,2,0], // CLC

    [0xD8,14,AddressMode.imp,2,0], // CLD

    [0x58,15,AddressMode.imp,2,0], // CLI

    [0xB8,16,AddressMode.imp,2,0], // CLV

    [0xC9,17,AddressMode.imm,2,0], // CMP
    [0xC5,17,AddressMode.zp,3,0],
    [0xD5,17,AddressMode.zpx,4,0],
    [0xCD,17,AddressMode.abs,4,0],
    [0xDD,17,AddressMode.abx,4,0],
    [0xD9,17,AddressMode.aby,4,0],
    [0xC1,17,AddressMode.izx,6,0],
    [0xD1,17,AddressMode.izy,5,0],

    [0xE0,18,AddressMode.imm,2,0], // CPX
    [0xE4,18,AddressMode.zp,3,0],
    [0xEC,18,AddressMode.abs,4,0],

    [0xC0,19,AddressMode.imm,2,0], // CPY
    [0xC4,19,AddressMode.zp,3,0],
    [0xCC,19,AddressMode.abs,4,0],

    [0xC6,20,AddressMode.zp,5,0], // DEC
    [0xD6,20,AddressMode.zpx,6,0],
    [0xCE,20,AddressMode.abs,6,0],
    [0xDE,20,AddressMode.abx,6,0],

    [0xCA,21,AddressMode.imp,2,0], // DEX

    [0x88,22,AddressMode.imp,2,0], // DEY

    [0x49,23,AddressMode.imm,2,1], // EOR
    [0x45,23,AddressMode.zp,3,1],
    [0x55,23,AddressMode.zpx,4,1],
    [0x4D,23,AddressMode.abs,4,1],
    [0x5D,23,AddressMode.abx,4,1],
    [0x59,23,AddressMode.aby,4,1],
    [0x41,23,AddressMode.izx,6,1],
    [0x51,23,AddressMode.izy,5,1],

    [0xE6,24,AddressMode.zp,5,0], // INC
    [0xF6,24,AddressMode.zpx,6,0],
    [0xEE,24,AddressMode.abs,6,0],
    [0xFE,24,AddressMode.abx,6,0],

    [0xE8,25,AddressMode.imp,2,0], // INX

    [0xC8,26,AddressMode.imp,2,0], // INY

    [0x4C,27,AddressMode.abs,3,0], // JMP
    [0x6C,27,AddressMode.ind,5,0],

    [0x20,28,AddressMode.abs,6,0], // JSR

    [0xA9,29,AddressMode.imm,2,1], // LDA
    [0xA5,29,AddressMode.zp,3,1],
    [0xB5,29,AddressMode.zpx,4,1],
    [0xAD,29,AddressMode.abs,4,1],
    [0xBD,29,AddressMode.abx,4,1],
    [0xB9,29,AddressMode.aby,4,1],
    [0xA1,29,AddressMode.izx,6,1],
    [0xB1,29,AddressMode.izy,5,1],

    [0xA2,30,AddressMode.imm,2,1], // LDX
    [0xA6,30,AddressMode.zp,3,1],
    [0xB6,30,AddressMode.zpy,4,1],
    [0xAE,30,AddressMode.abs,4,1],
    [0xBE,30,AddressMode.aby,4,1],

    [0xA0,31,AddressMode.imm,2,1], // LDY
    [0xA4,31,AddressMode.zp,3,1],
    [0xB4,31,AddressMode.zpx,4,1],
    [0xAC,31,AddressMode.abs,4,1],
    [0xBC,31,AddressMode.abx,4,1],

    [0x4A,32,AddressMode.acc,2,0], // LSR
    [0x46,32,AddressMode.zp,5,0],
    [0x56,32,AddressMode.zpx,6,0],
    [0x4E,32,AddressMode.abs,6,0],
    [0x5E,32,AddressMode.abx,6,0],

    [0xEA,33,AddressMode.imp,2,0], // NOP

    [0x09,34,AddressMode.imm,2,0], // ORA
    [0x05,34,AddressMode.zp,3,0],
    [0x15,34,AddressMode.zpx,4,0],
    [0x0D,34,AddressMode.abs,4,0],
    [0x1D,34,AddressMode.abx,4,0],
    [0x19,34,AddressMode.aby,4,0],
    [0x01,34,AddressMode.izx,6,0],
    [0x11,34,AddressMode.izy,5,0],

    [0x48,35,AddressMode.imp,3,0], // PHA

    [0x08,36,AddressMode.imp,3,0], // PHP

    [0x68,37,AddressMode.imp,4,0], // PLA

    [0x28,38,AddressMode.imp,4,0], // PLP

    [0x2A,39,AddressMode.acc,2,0], // ROL
    [0x26,39,AddressMode.zp,5,0],
    [0x36,39,AddressMode.zpx,6,0],
    [0x2E,39,AddressMode.abs,6,0],
    [0x3E,39,AddressMode.abx,6,0],

    [0x6A,40,AddressMode.acc,2,0], // ROR
    [0x66,40,AddressMode.zp,5,0],
    [0x76,40,AddressMode.zpx,6,0],
    [0x6E,40,AddressMode.abs,6,0],
    [0x7E,40,AddressMode.abx,6,0],

    [0x40,41,AddressMode.imp,6,0], // RTI

    [0x60,42,AddressMode.imp,6,0], // RTS

    [0xE9,43,AddressMode.imm,2,1], // SBC
    [0xE5,43,AddressMode.zp,3,1],
    [0xF5,43,AddressMode.zpx,4,1],
    [0xED,43,AddressMode.abs,4,1],
    [0xFD,43,AddressMode.abx,4,1],
    [0xF9,43,AddressMode.aby,4,1],
    [0xE1,43,AddressMode.izx,6,1],
    [0xF1,43,AddressMode.izy,5,1],

    [0x38,44,AddressMode.imp,2,0], // SEC

    [0xF8,45,AddressMode.imp,2,0], // SED

    [0x78,46,AddressMode.imp,2,0], // SEI

    [0x85,47,AddressMode.zp,3,0], // STA
    [0x95,47,AddressMode.zpx,4,0],
    [0x8D,47,AddressMode.abs,4,0],
    [0x9D,47,AddressMode.abx,4,0],
    [0x99,47,AddressMode.aby,4,0],
    [0x81,47,AddressMode.izx,6,0],
    [0x91,47,AddressMode.izy,5,0],

    [0x86,48,AddressMode.zp,3,0], // STX
    [0x96,48,AddressMode.zpy,4,0],
    [0x8E,48,AddressMode.abs,4,0],

    [0x84,49,AddressMode.zp,3,0], // STY
    [0x94,49,AddressMode.zpx,4,0],
    [0x8C,49,AddressMode.abs,4,0],

    [0xAA,50,AddressMode.imp,2,0], // TAX

    [0xA8,51,AddressMode.imp,2,0], // TAY

    [0xBA,52,AddressMode.imp,2,0], // TSX

    [0x8A,53,AddressMode.imp,2,0], // TXA

    [0x9A,54,AddressMode.imp,2,0], // TXS

    [0x98,55,AddressMode.imp,2,0], // TYA

    // ILLEGAL OPCODES

    [0x07,56,AddressMode.zp,5,0], // SLO
    [0x17,56,AddressMode.zpx,6,0],
    [0x03,56,AddressMode.izx,8,0],
    [0x13,56,AddressMode.izy,8,0],
    [0x0F,56,AddressMode.abs,6,0],
    [0x1F,56,AddressMode.abx,7,0],
    [0x1B,56,AddressMode.aby,7,0],

    [0x27,57,AddressMode.zp,5,0], // RLA
    [0x37,57,AddressMode.zpx,6,0],
    [0x23,57,AddressMode.izx,8,0],
    [0x33,57,AddressMode.izy,8,0],
    [0x2F,57,AddressMode.abs,6,0],
    [0x3F,57,AddressMode.abx,7,0],
    [0x3B,57,AddressMode.aby,7,0],

    [0xE7,58,AddressMode.zp,5,0], // ISC
    [0xF7,58,AddressMode.zpx,6,0],
    [0xE3,58,AddressMode.izx,8,0],
    [0xF3,58,AddressMode.izy,8,0],
    [0xEF,58,AddressMode.abs,6,0],
    [0xFF,58,AddressMode.abx,7,0],
    [0xFB,58,AddressMode.aby,7,0],

    [0x47,59,AddressMode.zp,5,0], // SRE
    [0x57,59,AddressMode.zpx,6,0],
    [0x43,59,AddressMode.izx,8,0],
    [0x53,59,AddressMode.izy,8,0],
    [0x4F,59,AddressMode.abs,6,0],
    [0x5F,59,AddressMode.abx,7,0],
    [0x5B,59,AddressMode.aby,7,0],

    [0x87,60,AddressMode.zp,3,0], // SAX
    [0x97,60,AddressMode.zpy,4,0],
    [0x83,60,AddressMode.izx,6,0],
    [0x8F,60,AddressMode.abs,4,0],

    [0x67,61,AddressMode.zp,5,0], // RRA
    [0x77,61,AddressMode.zpx,6,0],
    [0x63,61,AddressMode.izx,8,0],
    [0x73,61,AddressMode.izy,8,0],
    [0x6F,61,AddressMode.abs,6,0],
    [0x7F,61,AddressMode.abx,7,0],
    [0x7B,61,AddressMode.aby,7,0],

    [0xA7,62,AddressMode.zp,3,0], // LAX
    [0xB7,62,AddressMode.zpy,4,0],
    [0xA3,62,AddressMode.izx,6,0],
    [0xB3,62,AddressMode.izy,5,0],
    [0xAF,62,AddressMode.abs,4,0],
    [0xBF,62,AddressMode.aby,4,0],
    [0xAB,62,AddressMode.imm,2,0],

    [0xC7,63,AddressMode.zp,5,0], // DCP
    [0xD7,63,AddressMode.zpx,6,0],
    [0xC3,63,AddressMode.izx,8,0],
    [0xD3,63,AddressMode.izy,8,0],
    [0xCF,63,AddressMode.abs,6,0],
    [0xDF,63,AddressMode.abx,7,0],
    [0xDB,63,AddressMode.aby,7,0],

    [0x0B,64,AddressMode.imm,2,0], // ANC
    [0x2B,64,AddressMode.imm,2,0],

    [0x4B,65,AddressMode.imm,2,0], // ALR

    [0x6B,66,AddressMode.imm,2,0], // ARR

    [0xCB,67,AddressMode.imm,2,0], // SBX

    [0xEB,68,AddressMode.imm,2,0], // SBC

    [0xBB,69,AddressMode.aby,3,0], // LAS

    [0x1A,33,AddressMode.imp,2,0], // NOP
    [0x3A,33,AddressMode.imp,2,0],
    [0x5A,33,AddressMode.imp,2,0],
    [0x7A,33,AddressMode.imp,2,0],
    [0xDA,33,AddressMode.imp,2,0],
    [0xFA,33,AddressMode.imp,2,0],
    [0x80,33,AddressMode.imm,2,0],
    [0x82,33,AddressMode.imm,2,0],
    [0xC2,33,AddressMode.imm,2,0],
    [0xE2,33,AddressMode.imm,2,0],
    [0x89,33,AddressMode.imm,2,0],
    [0x04,33,AddressMode.zp,3,0],
    [0x44,33,AddressMode.zp,3,0],
    [0x64,33,AddressMode.zp,3,0],

    [0x14,33,AddressMode.zpx,4,0],
    [0x34,33,AddressMode.zpx,4,0],
    [0x54,33,AddressMode.zpx,4,0],
    [0x74,33,AddressMode.zpx,4,0],
    [0xD4,33,AddressMode.zpx,4,0],
    [0xF4,33,AddressMode.zpx,4,0],

    [0x0C,33,AddressMode.abs,4,0],

    [0x1C,33,AddressMode.abx,4,0],
    [0x3C,33,AddressMode.abx,4,0],
    [0x5C,33,AddressMode.abx,4,0],
    [0x7C,33,AddressMode.abx,4,0],
    [0xDC,33,AddressMode.abx,4,0],
    [0xFC,33,AddressMode.abx,4,0],

    [0x02,69,AddressMode.imp,1,0], // JAM
    [0x12,69,AddressMode.imp,1,0],
    [0x22,69,AddressMode.imp,1,0],
    [0x32,69,AddressMode.imp,1,0],
    [0x42,69,AddressMode.imp,1,0],
    [0x52,69,AddressMode.imp,1,0],
    [0x62,69,AddressMode.imp,1,0],
    [0x72,69,AddressMode.imp,1,0],
    [0x92,69,AddressMode.imp,1,0],
    [0xB2,69,AddressMode.imp,1,0],
    [0xD2,69,AddressMode.imp,1,0],
    [0xF2,69,AddressMode.imp,1,0],

    [0x93,70,AddressMode.zpy,1,0], // SHA
    [0x9F,70,AddressMode.aby,1,0],

    [0x9E,71,AddressMode.aby,1,0], // SHX

    [0x8B,72,AddressMode.imm,2,0], // XAA

    [0x9C,73,AddressMode.aby,1,0], // SHY

    [0x9B,74,AddressMode.aby,1,0], // TAS
];

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    AddressMode: AddressMode,
    InstructionNames: InstructionNames,
    JumpInstructions: JumpInstructions,
    OpcodeTable: OpcodeTable
};
