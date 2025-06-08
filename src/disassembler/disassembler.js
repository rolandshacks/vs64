//
// Disassembler for MOS 6502/6510
//

const fs = require('fs');
const path = require("path");

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { OpcodeTable, JumpInstructions, InstructionNames, AddressMode, BasicTokens, TsbBasicTokens, PetsciiControlCodes } = require('./opcodes');

//-----------------------------------------------------------------------------------------------//
// Constants
//-----------------------------------------------------------------------------------------------//

const HEXCHARS = "0123456789abcdef";
const HEXCHARS_UPPER = "0123456789ABCDEF";
const PROFILE_GNU = 0;
const PROFILE_ACME = 1;
const PROFILE = PROFILE_ACME;
const SPACES = "                                                                                "
const LABEL_SUFFIX = (PROFILE == PROFILE_GNU) ? ":" : "";

let OpcodeMap = null;
let PetsciiCodeMap = null;

const _FileType_ = {
    Unknown: -1,
    Del: 0,
    Seq: 1,
    Prg: 2,
    Usr: 3,
    Rel: 4
};

function int8FromBytes(dataByte) {
    return (dataByte & 0xff);
}

function charFromBytes(dataByte) {
    return String.fromCharCode(int8FromBytes(dataByte));
}

function nameFromPetsciiBytes(dataByte) {

    if (null == PetsciiCodeMap) {
        // create hash map singleton
        PetsciiCodeMap = new Map();
        for (const item of PetsciiControlCodes) {
            if (!PetsciiCodeMap.has(item[1])) {
                PetsciiCodeMap.set(item[1], item[0]);
            }
        }
    }

    const b = int8FromBytes(dataByte);

    const s = PetsciiCodeMap.get(b);
    if (s != null) {
        return "{" + s.toUpperCase() + "}";
    }

    return "{$" + b.toString(16) + "}";
}

function charFromPetsciiBytes(dataByte, lower_case, expand_html) {

    let b = int8FromBytes(dataByte);

    if (lower_case && b >= 65 && b <= 90)
        b += 32;
    else if (lower_case && b >= 97 && b <= 122)
        b -= 32;
    else if (b >= 193 && b <= 218)
        b -= 128;
    else if (b == 0x5b) return '[';
    else if (b == 0x5c) return '\\';
    else if (b == 0x5d) return ']';
    else if (b < 32 || b >= 128 || b == 0x5e || b == 0x5f)
        return nameFromPetsciiBytes(dataByte)
    else if (b == 32 && expand_html) {
        return "&nbsp;"
    }

    return String.fromCharCode(b);
}

function int16FromBytes(dataByteHi, dataByteLo) {
    return ((dataByteLo & 0xff) << 8) + (dataByteHi & 0xff);
}

function format8(value, upperCase) {
    const chars = (upperCase == true) ? HEXCHARS_UPPER : HEXCHARS;
    const i = (value & 0xff);
    return chars[i >> 4] + chars[i % 16];
}

function format16(value, upperCase) {
    const loByte = ((value >> 8) & 0xff);
    const hiByte = (value & 0xff);
    const str = format8(loByte, upperCase) + format8(hiByte, upperCase);
    return str;
}

function _formatStr_(str, len) {
    if (!str) return SPACES.substring(0, len);
    if (str.length >= len) {
        return str.substring(0, len);
    }
    return str + SPACES.substring(0, len - str.length);
}

class _Options_ {
    constructor() {
        this.show_binary = true;
        this.show_comments = true;
    }
}

class StatementType {};
StatementType.Empty = 0x0;
StatementType.Invalid = 0x1;
StatementType.Normal = 0x2;
StatementType.Buffer = 0x3;
StatementType.Meta = 0x4;
StatementType.Opcode = 0x5;
StatementType.Basic = 0x6;
StatementType.Comment = 0x7;
StatementType.Label = 0x8;

class Statement {

    static createDefault() {
        const statement = new Statement(StatementType.Opcode);
        statement.addr = null;
        statement.opcode = null;
        statement.instruction = null;
        statement.data = null;
        statement.data2 = null;
        statement.address_mode = null;
        statement.cycles = null;
        statement.cross_page = null;
        statement.instruction_size = null;
        statement.jump_address = null;
        return statement;
    }

    static createEmpty() {
        return new Statement(StatementType.Empty);
    }

    static createMeta(meta, comment) {
        const statement = new Statement(StatementType.Mety);
        statement.meta = meta;
        statement.comment = comment;
        return statement;
    }

    static createBasic(basic_line, basic_code) {
        const statement = new Statement(StatementType.Basic);
        statement.basic_line = basic_line;
        statement.basic_code = basic_code;
        return statement;
    }

    static createBuffer(addr, buffer, index) {
        const statement = new Statement(StatementType.Buffer);
        statement.addr = addr;
        statement.buffer = buffer;
        statement.index = index;
        return statement;
    }

    static createComment(comment) {
        const statement = new Statement(StatementType.Comment);
        statement.comment = comment;
        return statement;
    }

    static createInvalid(addr, opcode) {
        const statement = new Statement(StatementType.Invalid);
        statement.addr = addr;
        statement.opcode = opcode;
        statement.comment = "unknown opcode";
        return statement;
    }

    constructor(type) {
        this.type = type;
        this.refs = [];
        this.index = null;
        this.jump_target = null;
        this.comment = null;
        this.jump_address = null;
        this.irq_handler = null;
    }

    has_refs() {
        return (this.refs && this.refs.length > 0);
    }

    set_comment(comment) {
        this.comment = comment;
    }

    add_jump_target(jump_target) {
        this.jump_target = jump_target;
    }

    get_label_name() {
        if (this.type == StatementType.Buffer) {
            return "buffer" + this.index;
        } else if (this.irq_handler)
            return "irq" + this.index;
        else
            return "label" + this.index;
    }

    get_jump_addr() {
        if (this.jump_address !== null) {
            return this.jump_address;
        } else if (this.data2 !== null) {
            return ((this.data2 & 0xff) << 8) | (this.data & 0xff);
        } else if (this.data !== null) {
            let rel_addr = this.data;
            if (rel_addr >= 128) rel_addr -= 256; // signed 8bit
            return this.addr + rel_addr + 2;
        }

        return null;
    }

    add_ref(ref) {
        this.refs.push(ref);
    }

    is_jump() {
        if (!this.instruction) return false;
        const flag = (JumpInstructions.indexOf(this.instruction) >= 0);
        return flag;
    }

    is_return() {
        return (this.instruction == 41 || this.instruction == 42); // RTS || RTI
    }

    getInstructionName() {
        if (null == this.instruction) return "";
        const instructionName = InstructionNames[this.instruction];
        if (null == instructionName) return "";
        const opcode_s = instructionName.toLowerCase();
        return opcode_s;
    }

    getInstructionParamAsAddr() {
        let val = 0x0;
        if (this.data != null && this.data2 != null) {
            val = (this.data2 << 8) + this.data;
        } else if (this.data != null) {
            val = this.data;
        }
        return val;
    }

    getInstructionParams() {
        let data_s = null;
        let val = null;
        if (this.data != null && this.data2 != null) {
            val = (this.data2 << 8) + this.data;
            data_s = "$" + format16(val);
        } else if (this.data != null) {
            data_s = "$" + format8(this.data);
        }

        let prefix = "";
        let suffix = "";
        if (this.address_mode == AddressMode.imm) prefix = "#";
        if (this.address_mode == AddressMode.abx || this.address_mode == AddressMode.zpx) suffix = ",X";
        if (this.address_mode == AddressMode.aby || this.address_mode == AddressMode.zpy) suffix = ",Y";
        if (this.address_mode == AddressMode.izx) {
            prefix = "(";
            suffix = ",X)";
        }
        if (this.address_mode == AddressMode.izy) {
            prefix = "(";
            suffix = "),Y";
        }

        const params = (data_s ? prefix + data_s + suffix : "");

        return params;
    }

    getInstructionJumpLabel() {
        const jumpLabel = (this.is_jump() && this.jump_target) ? this.jump_target.get_label_name() : null;
        return jumpLabel;
    }

    getInstructionHex() {
        if (this.type == StatementType.Invalid) {
            return format8(this.opcode, true);
        }

        let hex_s = format8(this.opcode, true);
        if (this.data2 != null) hex_s += " " + format8(this.data, true) + format8(this.data2, true);
        else if (this.data != null) hex_s += " " + format8(this.data, true);
        return hex_s;
    }

    getHexLines(maxElementsPerLine) {
        if (!maxElementsPerLine) maxElementsPerLine = 16;
        let s = "";
        let i = 0;
        let lines = [];
        let count = 0;
        while (i < this.buffer.length) {
            const b = this.buffer[i];
            i += 1;
            count += 1;

            if (s.length > 0) s += ",";
            s += "$" + format8(b);

            if (count >= maxElementsPerLine || i == this.buffer.length) {
                lines.push(s);
                s = "";
                count = 0;
            }
        }

        return lines;
    }
}

function find_addr(statements, addr) {
    if (addr === null) return null;
    for (const statement of statements) {
        if (statement.addr == addr) {
            return statement;
        }
    }

    return null;
}

function get(data, pos) {
    const sz = data.length;
    if (pos >= sz) return 0;
    return data[pos];
}

function process(binary, write, options) {
    OpcodeMap = new Map();
    for (const opcode_info of OpcodeTable) {
        const opcode = opcode_info[0];
        OpcodeMap.set(opcode, opcode_info);
    }

    const binary_size = binary.length;
    if (binary_size < 2) {
        console.log("invalid file size");
        return;
    }

    const jump_table = [];
    const statements = [];

    let ofs = 0;

    statements.push(Statement.createComment("////////////////////////////////////////////////////////////////////////////////"));
    statements.push(Statement.createComment("//"));
    statements.push(Statement.createComment("// DISASSEMBLED"));
    statements.push(Statement.createComment("//"));
    statements.push(Statement.createComment("////////////////////////////////////////////////////////////////////////////////"));
    statements.push(Statement.createEmpty());

    const load_address = int16FromBytes(binary[ofs], binary[ofs + 1]);
    ofs += 2;
    let out_s = "*=$" + format16(load_address);

    statements.push(Statement.createMeta(out_s, "load address (" + load_address + ")"));
    statements.push(Statement.createEmpty());

    let sys_jump_address = null;
    let sys_jump_ofs = null;

    if (load_address == 0x0801) {
        // load address is BASIC start

        const lower_case = options && options.lower_case;

        const specialChars = [100, 34, 58, 40, 41];
        const operatorChars = [170, 171, 172, 173, 174, 177, 178, 179];

        const tokens = [];
        for (const item of BasicTokens) {
            const idx = (item[1] - 0x80);
            while (tokens.length < idx) tokens.push("");
            tokens.push(item[0]);
        }

        const tcb_tokens = [];
        for (const item of TsbBasicTokens) {
            const idx = (item[1] - 1);
            while (tcb_tokens.length < idx) tcb_tokens.push("");
            tcb_tokens.push(item[0]);
        }

        while (ofs < binary_size && (null === sys_jump_ofs || ofs < sys_jump_ofs)) {

            let output_buffer = "";

            // const basic_addr = load_address + ofs - basic_ofs;
            const basic_next_addr = int16FromBytes(binary[ofs], binary[ofs + 1]);
            ofs += 2;

            if (0x0 == basic_next_addr) break;

            const basic_line_num = int16FromBytes(binary[ofs], binary[ofs + 1]);
            ofs += 2;

            // read statement
            while (ofs < binary_size && (null === sys_jump_ofs || ofs < sys_jump_ofs)) {

                const b = int8FromBytes(binary[ofs]);
                ofs++;

                if (b == 0x0) {
                    break; // end of line
                } else if (b >= 0x80 || specialChars.indexOf(b) != -1) {

                    if (b >= 0x80) {
                        // BASIC tokens

                        const token = tokens[b-0x80];

                        if (operatorChars.indexOf(b) != -1) {
                            // # operators +-*/()...
                            output_buffer += token;
                            // next_char_type = char_type_operator

                        } else {
                            output_buffer += lower_case ? token.toLowerCase() : token;

                            if (b == 0x8f) { // REM
                                while (ofs < binary_size && int8FromBytes(binary[ofs]) != 0) {
                                    output_buffer += charFromPetsciiBytes(binary[ofs], lower_case);
                                    ofs++;
                                }
                            } else if (b == 0x9e && null === sys_jump_address) { // SYS
                                let i = ofs;
                                while (i < binary_size && int8FromBytes(binary[i]) == 0x20) { i++; }

                                let steps = 0;
                                let addr = 0;
                                while (i < binary_size && steps < 5) {
                                    let c = int8FromBytes(binary[i]);
                                    if (c >= 48 && c <= 57) {
                                        addr = (addr * 10) + (c - 48);
                                    } else {
                                        break;
                                    }
                                    steps++;
                                    i++;
                                }

                                if (steps > 0) {
                                    sys_jump_address = addr;
                                    sys_jump_ofs = sys_jump_address - load_address + 2;
                                }
                            }

                        }

                    } else if (b == 100) {
                        // TSB tokens

                        if (ofs >= binary_size) break;
                        let b2 = int8FromBytes(binary[ofs]);
                        ofs++;

                        // map BASIC extension tokens (3c<-b3, 3d<-b2, 3e<-b1)
                        if (b2 >= 0xb1 && b2 <= 0xb3) b2 ^= 0x8f;

                        const token = (b2 <= tcb_tokens.length) ? tcb_tokens[b2-1] : "{UNKNOWN TOKEN:" + b2 + "}";

                        output_buffer += lower_case ? token.toLowerCase() : token;

                        if (b2 == 40) {
                            output_buffer += "(";
                        }

                    } else if (b == 34) {

                        output_buffer += "\"";

                        while (ofs < binary_size && int8FromBytes(binary[ofs]) != 34 && int8FromBytes(binary[ofs]) != 0) {
                            let c = charFromPetsciiBytes(binary[ofs], lower_case, true);
                            output_buffer += c;
                            ofs++;
                        }

                        if (ofs < binary_size && int8FromBytes(binary[ofs]) == 34) {
                            output_buffer += "\"";
                            ofs++;
                        }

                    } else if (b == 40 || b == 41) { // '('
                        output_buffer += charFromBytes(b);
                    } else if (b == 58) { // ':'
                        output_buffer += charFromBytes(b);
                    }
                } else {
                    output_buffer += charFromPetsciiBytes(b, lower_case);
                }
            }

            if (output_buffer.length > 0) {
                statements.push(Statement.createBasic(basic_line_num, output_buffer));
            }
        }
    }

    statements.push(Statement.createEmpty());

    let buffer_index = 0;
    let addr = 0x0;
    const asm_start_offset = ofs;

    iterate_binary(binary, load_address, asm_start_offset, null, (info) => {
        if (info.statement) {
            const statement = info.statement;
            if (statement.is_jump()) {
                const jump_addr = statement.get_jump_addr();
                if (null !== jump_addr) {
                    jump_table.push(jump_addr);
                }
            }
        }
    });

    jump_table.sort(function(a, b) { return a - b; });

    iterate_binary(binary, load_address, asm_start_offset, jump_table, (info) => {
        addr = info.address;
        if (info.illegal) {
            statements.push(Statement.createInvalid(addr, info.illegal.opcode));
            return;
        } else if (info.buffer) {
            const b = info.buffer;
            const buffer = binary.subarray(b.start, b.end);
            const statement = Statement.createBuffer(addr, buffer, buffer_index);
            statements.push(statement);
            buffer_index += 1;
            return;
        } else if (info.statement) {
            const statement = info.statement;
            statement.addr = addr;
            statements.push(statement);
        }
    });

    for (const statement of statements) {
        if (statement.is_jump() || statement.jump_address !== null) {
            const jump_target = find_addr(statements, statement.get_jump_addr());
            if (jump_target) {
                statement.add_jump_target(jump_target);
                jump_target.add_ref(statement);
                if (!statement.is_jump()) {
                    jump_target.irq_handler = true;
                }
            }
        }
    }

    add_comments(statements);

    let label_index = 0;
    let irq_index = 0;
    for (const statement of statements) {
        if (statement.has_refs()) {
            if (statement.irq_handler != null) {
                statement.index = irq_index;
                irq_index += 1;
            } else {
                statement.index = label_index;
                label_index += 1;
            }
        }
    }

    let last_blank = false;

    // output statements
    for (const statement of statements) {

        if (statement.has_refs()) {
            if (!last_blank) write(StatementType.Empty, null);
            write(StatementType.Label, statement);
        }

        if (statement.type == StatementType.Buffer && (!last_blank)) {
            write(StatementType.Empty, null);
        }

        last_blank = false;

        write(statement.type, statement);

        if (statement.type == StatementType.Empty) {
            last_blank = true;
        }

        if (statement.is_return()) {
            if (!last_blank) {
                write(StatementType.Empty, null);
                last_blank = true;
            }
        }
    }

    return;
}

function iterate_binary(binary, load_addr, ofs, jump_table, visitor) {

    const ofs_end = binary.length;

    let opcode = 0x0;

    let jump_table_idx = 0;
    let next_jump_addr = (null != jump_table && jump_table.length > 0 ? jump_table[0] : null);

    let last_addr = null;
    let addr = null;

    while (ofs < ofs_end) {
        last_addr = addr;
        addr = load_addr + ofs - 2;

        if (null != jump_table) {
            while (jump_table_idx < jump_table.length && addr > jump_table[jump_table_idx]) {
                jump_table_idx++;
            }
            next_jump_addr = (jump_table_idx < jump_table.length ? jump_table[jump_table_idx] : null);
        }

        opcode = binary[ofs];
        if (opcode == 0x0) {
            // binary data
            const buffer_start = ofs;
            while (ofs < ofs_end && binary[ofs] == 0x0) { ofs += 1; }
            visitor({
                address: addr,
                position: buffer_start,
                buffer: {
                    start: buffer_start,
                    end: ofs
                }
            });
            continue;
        } else if (!OpcodeMap.get(opcode)) {
            // invalid opcode
            visitor({
                address: addr,
                position: ofs,
                invalid: {
                    opcode: opcode
                }
            });
            ofs += 1;
            continue;
        }

        const opcode_info = OpcodeMap.get(opcode);
        const address_mode = opcode_info[2];

        let data = null;
        let data2 = null;
        let data_size = 0;

        if (address_mode == AddressMode.imm ||
            address_mode == AddressMode.zp ||
            address_mode == AddressMode.zpx ||
            address_mode == AddressMode.zpy ||
            address_mode == AddressMode.izx ||
            address_mode == AddressMode.izy ||
            address_mode == AddressMode.rel) {
            data_size = 1;
        } else if (address_mode == AddressMode.abs ||
            address_mode == AddressMode.ind ||
            address_mode == AddressMode.abx ||
            address_mode == AddressMode.aby) {
            data_size = 2;
        } else { ; } // imp, acc

        if (data_size >= 1) {
            data = (ofs + 1 < ofs_end) ? binary[ofs + 1] : 0;
        }

        if (data_size >= 2) {
            data2 = (ofs + 2 < ofs_end) ? binary[ofs + 2] : 0;
        }

        const instruction_size = 1 + data_size;

        if (null !== next_jump_addr) {
            if (addr < next_jump_addr && addr + instruction_size > next_jump_addr) {
                // assume raw data, skip the bytes
                ofs += (next_jump_addr - addr);
                continue;
            }
        }

        const statement = Statement.createDefault();
        statement.addr = addr;
        statement.opcode = opcode;
        statement.instruction =  opcode_info[1];
        statement.address_mode = opcode_info[2];
        statement.cycles = opcode_info[3];
        statement.cross_page = opcode_info[4];
        statement.instruction_size = instruction_size;
        statement.data = data;
        statement.data2 = data2;

        // detect implicit address references (from irq setup, etc.)
        if (opcode == 0xa2 &&
            get(binary, ofs + 2) == 0xa0 &&
            get(binary, ofs + 4) == 0x8e &&
            get(binary, ofs + 7) == 0x8c) {

            // LDX + LDY + STX + STY := set IRQ

            const addr_1 = get(binary, ofs + 1) | (get(binary, ofs + 3) << 8);
            const addr_2 = get(binary, ofs + 5) | (get(binary, ofs + 6) << 8);
            const addr_3 = get(binary, ofs + 8) | (get(binary, ofs + 9) << 8);

            if ((addr_2 == 0xfffe && addr_3 == 0xffff) ||
                (addr_2 == 0x0314 && addr_3 == 0x0315)) {
                statement.jump_address = addr_1;
            }
        } else if (opcode == 0x8c && get(binary, ofs + 3) == 0x8d) {
            // STY + STA
            const addr_1 = get(binary, ofs + 1) | (get(binary, ofs + 2) << 8);
            const addr_2 = get(binary, ofs + 4) | (get(binary, ofs + 5) << 8);

            if ((addr_1 == 0xfffe && addr_2 == 0xffff) ||
                (addr_1 == 0x0314 && addr_2 == 0x0315)) {
                statement.jump_address = addr_1;
            }
        }

        visitor({
            address: addr,
            position: ofs,
            statement: statement,
            opcode_info: opcode_info
        });

        ofs += instruction_size;
    }

    return ofs;
}

function add_comments(statements) {
    //let previous_statement = null;
    for (const statement of statements) {
        const instruction = statement.instruction;
        if (null == instruction) continue;

        const instructionName = statement.getInstructionName();
        const opcode = statement.opcode;

        if (instruction == 42) {
            statement.set_comment("return");
        } else if (statement.is_jump()) {
            let addr = (statement.jump_target != null) ? statement.jump_target.addr : statement.jump_address;
            if (null == addr && opcode == 0x4c) addr = statement.getInstructionParamAsAddr(); // absolute JMP address
            if (null != addr) statement.set_comment(instructionName + " $" + format16(addr));
        } else if (opcode == 0x8c || opcode == 0x8d || opcode == 0x8e) {
            // store to abs address
            const addr = statement.getInstructionParamAsAddr();
            let addrName = getMemoryAddressName(addr);
            if (null != addrName) {
                statement.set_comment("store " + addrName);
            } else {
                statement.set_comment("store to $" + format16(addr));
            }
        } else if (opcode == 0xac || opcode == 0xad || opcode == 0xae) {
            // store to abs address
            const addr = statement.getInstructionParamAsAddr();
            let addrName = getMemoryAddressName(addr);
            if (null != addrName) {
                statement.set_comment("load " + addrName);
            } else {
                statement.set_comment("load from $" + format16(addr));
            }
        } else if (statement.address_mode == AddressMode.abs) {
            const addr = statement.getInstructionParamAsAddr();
            let addrName = getMemoryAddressName(addr);
            if (null != addrName) {
                statement.set_comment(instructionName + " " + addrName);
            } else {
                statement.set_comment(instructionName + " $" + format16(addr));
            }
        }

        //previous_statement = statement;
    }
}

const VICRegisterNames = [
    "sprite #0 x",
    "sprite #0 y",
    "sprite #1 x",
    "sprite #1 y",
    "sprite #2 x",
    "sprite #2 y",
    "sprite #3 x",
    "sprite #3 y",
    "sprite #4 x",
    "sprite #4 y",
    "sprite #5 x",
    "sprite #5 y",
    "sprite #6 x",
    "sprite #6 y",
    "sprite #7 x",
    "sprite #7 y",
    "sprite x bit 8",
    "screen control #1",
    "raster line",
    "light pen x",
    "light pen y",
    "sprite enable",
    "screen control #2",
    "sprite double height",
    "memory setup",
    "interrupt status",
    "interrupt control",
    "sprite priority",
    "sprite multicolor",
    "sprite double width",
    "sprite-sprite collision",
    "sprite-background collision",
    "border color",
    "background color",
    "extra background color #1",
    "extra background color #2",
    "extra background color #3",
    "sprite extra color #1",
    "sprite extra color #2",
    "sprite #0 color",
    "sprite #1 color",
    "sprite #2 color",
    "sprite #3 color",
    "sprite #4 color",
    "sprite #5 color",
    "sprite #6 color",
    "sprite #7 color"
];

const SIDRegisterNames = [
    "voice #1 frequency",
    "voice #1 frequency",
    "voice #1 pulse width",
    "voice #1 pulse width",
    "voice #1 control register",
    "voice #1 attack and decay",
    "voice #1 sustain and release",
    "voice #2 frequency",
    "voice #2 frequency",
    "voice #2 pulse width",
    "voice #2 pulse width",
    "voice #2 control register",
    "voice #2 attack and decay",
    "voice #2 sustain and release",
    "voice #3 frequency",
    "voice #3 frequency",
    "voice #3 pulse width",
    "voice #3 pulse width",
    "voice #3 control register",
    "voice #3 attack and decay",
    "voice #3 sustain and release",
    "filter cut off frequency",
    "filter cut off frequency",
    "filter control",
    "volume and filter modes",
    "paddle x value",
    "paddle y value",
    "voice #3 waveform output",
    "voice #3 ADSR output"
];

const CIA1RegisterNames = [
    "port A keyboard and joystick #2",
    "port B keyboard and joystick #1",
    "port A data direction",
    "port B data direction",
    "timer A",
    "timer A",
    "timer B",
    "timer B",
    "time / alarm",
    "time / alarm",
    "time / alarm",
    "time / alarm",
    "serial shift register",
    "interrupt control and status",
    "timer A control",
    "timer B control"
];

const CIA2RegisterNames = [
    "port A serial bus access",
    "port B RS232 access",
    "port A data direction",
    "port B data direction",
    "timer A",
    "timer A",
    "timer B",
    "timer B",
    "time / alarm",
    "time / alarm",
    "time / alarm",
    "time / alarm",
    "serial shift register",
    "interrupt control and status",
    "timer A control",
    "timer B control"
];

function arrayGet(a, idx, defaultValue) {
    defaultValue ||= null;
    if (null == a || a.length < 1) return defaultValue;
    if (idx < 0 || idx >= a.length) return defaultValue;
    return a[idx] || defaultValue;
}

function getMemoryAddressName(addr) {
    if (null == addr) return null;

    let addrName = null;

    if (addr <= 0xff) {
        addrName = "zeropage register";
    } else if (addr >= 0xd800 && addr <= 0xdbff) {
        addrName = "color RAM";
    } else if (addr >= 0xd000 && addr <= 0xd3ff) {
        addrName = "VIC " + arrayGet(VICRegisterNames, addr-0xd000, "register");
    } else if (addr >= 0xd400 && addr <= 0xd7ff) {
        addrName = "SID " + arrayGet(SIDRegisterNames, addr-0xd400, "register");
    } else if (addr >= 0xdc00 && addr <= 0xdcff) {
        addrName = "CIA1 " + arrayGet(CIA1RegisterNames, addr-0xdc00, "register");
    } else if (addr >= 0xdd00 && addr <= 0xddff) {
        addrName = "CIA2 " + arrayGet(CIA2RegisterNames, addr-0xdd00, "register");
    } else if (addr >= 0xfffe && addr <= 0xffff) {
        addrName = "IRQ address";
    }

    return addrName;
}

//-----------------------------------------------------------------------------------------------//
// Html Formatter
//-----------------------------------------------------------------------------------------------//

class Html {

    static tag(_class, _value, _fixedWidth) {

        let s = "";
        if (_value) s = _value.trim();
        if (s.length > _fixedWidth) s = s.substring(0, _fixedWidth);
        let line = "<span class='" + _class + "'>" + s + "</span>";
        if (s.length < _fixedWidth) {
            const needed = _fixedWidth - s.length;
            line += "<span class='space'>" + Html.spaces(needed) + "</span>";
        }
        return line;
    }

    static spaces(len) {
        return Html.SPACES.substring(0, len * 6); // &nbsp;
    }

    static fixed(txt, len) {

        if (txt.length == len) return txt;
        if (txt.length > len) txt.substring(0, len);

        const needed = len - txt.length;
        return txt + Html.spaces(needed);
    }

    static fixedRight(txt, len) {
        if (txt.length == len) return txt;
        if (txt.length > len) txt.substring(0, len);

        const needed = len - txt.length;
        return Html.spaces(needed) + txt;
    }

    static empty() {
        return Html.tag("empty", "</br>");
    }

    static comment(_comment) {
        return Html.tag("linecomment", "; " + _comment)
    }

    static label(_label) {
        return Html.tag("label", _label)
    }

    static meta(_meta, _comment) {
        let line = Html.tag("meta", _meta);
        if (_comment) {
            line += Html.tag("space", "&nbsp;;&nbsp;");
            line += Html.tag("comment", _comment);
        }
        return line;
    }

    static basic(_basic_line, _basic_code) {

        //const ln = this.fixedRight(_basic_line.toString(), 5)
        const ln = _basic_line.toString();

        let line = Html.tag("basiclinenumber", ln) +
                   Html.tag("space", "&nbsp;") +
                   Html.tag("basicstatement", _basic_code);

        return line;

    }

    static opcode(_instruction, _params, _label, _addr, _hex, _comment) {

        let line = Html.spaces(4);

        let len = 0;

        line += Html.tag('opcode', _instruction, 3); len += 3;

        const minLength = 20;

        if (_label) {
            line += "&nbsp;" + Html.tag('jumplabel', _label); len += _label.length;
        } else if (_params) {
            line += "&nbsp;" + Html.tag('params', _params); len += _params.length;
        } else {
            line += "&nbsp;" + Html.tag('params', "&nbsp;"); len += 1;
        }

        if (len < minLength) line += Html.spaces(minLength - len);

        let semicolon = false;

        if (_addr) {
            line += Html.tag("address", (semicolon ? "" : "&nbsp;;&nbsp;") + this.fixed(_addr, 5) + "&nbsp;");
            semicolon = true;
        }

        if (_hex) {
            if (!semicolon) line += Html.tag("space", "&nbsp;;&nbsp;");
            line += Html.tag("hex", _hex, 8);
            semicolon = true;
        }

        if (_comment) {
            if (!semicolon) {
                line += Html.tag("space", Html.spaces(8) + ";&nbsp;");
            } else {
                line += Html.tag("space", Html.spaces(8));
            }
            line += Html.tag("comment", _comment);
            semicolon = true;
        }

        return line;

    }

    static data(_buffer) {
        let line = "";
        line += Html.tag('data', _buffer);
        return line;
    }

    static statement(_lineNumber, _line) {
        const lineNumberStr = Html.tag("linenumber", this.fixedRight(_lineNumber.toString(), 4));
        return "<div class='statement'><nobr>" + lineNumberStr + _line + "</nobr></div>";
    }
}

Html.SPACES = '&nbsp;'.repeat(80);

//-----------------------------------------------------------------------------------------------//
// Disassembler
//-----------------------------------------------------------------------------------------------//

class Disassembler {
    constructor(options) {
        this._options = options;
        this._outputBuffer = null;
    }

    disassembleFile(filename) {

        const ext = path.extname(filename).toLowerCase();
        if (ext != ".prg") {
            throw("unsupported file format: " + ext);
        }

        if (!fs.existsSync(filename)) {
            throw ("" + filename + "does not exist or is invalid");
        }

        const binary = fs.readFileSync(filename);

        return this.disassemble(binary);
    }

    disassemble(binary) {

        if (binary == null) {
            throw("failed to read input file");
        }

        const instance = this;
        const options = this._options;

        const Formatter = Html;

        this.#open();

        process(binary, (type, statement) => {
            instance.#write(Formatter, type, statement);
        }, options);

        const result = this._outputBuffer;

        this.#close();

        return result;
    }

    #open() {

        this._outputLineNumber = 0;
        this._outputBuffer = "";
    }

    #close() {
    }

    #out(line) {
        //this._outputBuffer.push(line);
        this._outputBuffer += line + "\n";
    }

    #write(FormatterClass, type, statement) {

        const Formatter = FormatterClass;

        let line = null;

        switch (type) {
            case StatementType.Empty: {
                line = Formatter.empty();
                break;
            }
            case StatementType.Label: {
                const label = statement.get_label_name() + LABEL_SUFFIX;
                line = Formatter.label(label);
                break;
            }
            case StatementType.Comment: {
                const comment = statement.comment;
                line = Formatter.comment(comment);
                break;
            }
            case StatementType.Meta: {
                const meta = statement.meta;
                const comment = statement.comment;
                line = Formatter.meta(meta, comment);
                break;
            }
            case StatementType.Basic: {
                const basic_line = statement.basic_line;
                const basic_code = statement.basic_code;
                line = Formatter.basic(basic_line, basic_code);
                break;
            }
            case StatementType.Opcode: {
                const addr = "$" + format16(statement.addr, true);
                const instruction = statement.getInstructionName();
                const params = statement.getInstructionParams();
                const jumpLabel = statement.getInstructionJumpLabel();
                const hex = statement.getInstructionHex();
                const comment = statement.comment;
                line = Formatter.opcode(instruction, params, jumpLabel, addr, hex, comment);
                break;
            }
            case StatementType.Invalid: {
                const addr = "$" + format16(statement.addr, true);
                const instruction = "???";
                const hex = statement.getInstructionHex();
                const comment = statement.comment;
                line = Formatter.opcode(instruction, null, null, addr, hex, comment);
            }
            case StatementType.Buffer: {
                const label = "." + statement.get_label_name();
                const prefix = "!byte";
                const lines = statement.getHexLines();

                this.#out(Formatter.statement(this._outputLineNumber++,
                    Formatter.label(label) + "&nbsp;" +
                    Formatter.tag('opcode', prefix) + "&nbsp;" +
                    Formatter.data(lines[0])
                ));

                if (lines.length > 1) {
                    for (let i=1; i<lines.length; i++) {
                        this.#out(Formatter.statement(this._outputLineNumber++,
                            Formatter.tag("indentedspaces", Formatter.spaces(label.length + 1) + prefix + "&nbsp;") +
                            Formatter.data(lines[i])
                        ));
                    }
                }
            }
            default: {
                break;
            }
        }

        if (line) {
            this.#out(Formatter.statement(this._outputLineNumber++, line));
        }

    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Disassembler: Disassembler
};
