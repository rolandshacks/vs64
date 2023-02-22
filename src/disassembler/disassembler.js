//
// Disassembler for MOS 6502/6510
//

const fs = require('fs');
const path = require("path");

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { OpcodeTable, JumpInstructions, InstructionNames, AddressMode } = require('./opcodes');

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

const FileType = {
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

function formatStr(str, len) {
    if (!str) return SPACES.substring(0, len);
    if (str.length >= len) {
        return str.substring(0, len);
    }
    return str + SPACES.substring(0, len - str.length);
}

function petscii_to_ascii(c) {
    // cheap implementation
    return c;
}

class Options {
    constructor() {
        this.show_binary = true;
        this.show_comments = true;
    }
}

class Statement {

    static create(addr, opcode, instruction, data, data2, address_mode, cycles, cross_page) {

        const statement = new Statement("opcode");

        statement.addr = addr;
        statement.opcode = opcode;
        statement.instruction = instruction;
        statement.data = data;
        statement.data2 = data2;
        statement.address_mode = address_mode;
        statement.cycles = cycles;
        statement.cross_page = cross_page;

        return statement;
    }

    static createEmpty() {
        return new Statement("empty");
    }

    static createMeta(meta, comment) {
        const statement = new Statement("meta");

        statement.meta = meta;
        statement.comment = comment;

        return statement;
    }

    static createBuffer(addr, buffer) {

        const statement = new Statement("buffer");

        statement.addr = addr;
        statement.buffer = buffer;

        return statement;
    }

    static createComment(comment) {
        const statement = new Statement("comment");

        statement.comment = comment;

        return statement;
    }

    static createInvalid(addr, opcode) {
        const statement = new Statement("invalid");

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
        if (this.type == 'buffer') {
            return "buffer" + this.index;
        } else if (this.irq_handler)
            return "irq" + this.index;
        else
            return "label" + this.index;
    }

    get_jump_addr() {
        if (this.jump_address) return this.jump_address;
        if (this.data2 != null) {
            return (this.data2 << 8) + this.data;
        } else if (this.data != null) {
            let rel_addr = this.data;
            if (rel_addr >= 128) rel_addr -= 256; // signed 8bit
            return this.addr + rel_addr + 2;
        } else {
            return 0x0;
        }
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

    // valid opcode to string

    getInstractionName() {
        const opcode_s = InstructionNames[this.instruction].toLowerCase();

        return opcode_s;
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
        if (this.type == 'invalid') {
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


function comment(txt) {
    return {
        type: "comment",
        text: txt
    };
}

function process(binary, write) {

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

    const basic_line_ptr = int16FromBytes(binary[ofs], binary[ofs + 1]);
    ofs += 2;

    const basic_line_num = int16FromBytes(binary[ofs], binary[ofs + 1]);
    ofs += 2;

    while (ofs < binary_size) {
        const dummy_byte = int8FromBytes(binary[ofs]);
        if (dummy_byte == 0x9e) break;
        ofs += 1;
    }

    const sys_command = int8FromBytes(binary[ofs]);
    if (sys_command != 0x9e) {
        console.log("unexpected basic SYS command $" + format8(sys_command));
        return;
    }

    ofs += 1;

    let basic_statement = "";
    while (ofs < binary_size) {
        const b = binary[ofs];
        ofs += 1;
        if (b == 0x0) break;
        basic_statement += String.fromCharCode(petscii_to_ascii(b));
    }

    const basic_next_line_ptr = int16FromBytes(binary[ofs], binary[ofs + 1]);
    if (basic_next_line_ptr != 0x0) {
        console.log("basic next line address: $" + format16(basic_next_line_ptr));
    }
    ofs += 2;

    let byte_s = "";
    for (let i = 2; i < ofs; i++) {
        const b = binary[i];
        if (i > 2) byte_s += ",";
        byte_s += "$" + format8(b);
    }

    out_s = "!byte " + byte_s;
    statements.push(Statement.createMeta(out_s, basic_line_num + " SYS" + basic_statement));
    statements.push(Statement.createEmpty());

    let buffer_index = 0;

    let opcode = 0x0;
    let addr = 0x0;

    while (ofs < binary_size) {
        addr = load_address + ofs - 2;
        opcode = binary[ofs];

        if (opcode == 0x0) {
            const buffer = [];
            while (ofs < binary_size && binary[ofs] == 0x0) {
                buffer.push(binary[ofs]);
                ofs += 1;
            }
            const statement = Statement.createBuffer(addr, buffer);
            statement.index = buffer_index;
            statements.push(statement);
            buffer_index += 1;
            continue;
        }

        if (!OpcodeMap.get(opcode)) {
            statements.push(Statement.createInvalid(addr, opcode));
            ofs += 1;
            continue;
        }

        const opcode_info = OpcodeMap.get(opcode);
        const instruction = opcode_info[1];
        let opcode_name = InstructionNames[instruction];
        if (!opcode_name) {
            //console.log("unknown opcode name: $" + format8(opcode))
            opcode_name = "???";
        }

        const address_mode = opcode_info[2];
        const cycles = opcode_info[3];
        const cross_page = opcode_info[4];

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

        if (data_size >= 1) data = (ofs + 1 < binary_size) ? binary[ofs + 1] : 0;
        if (data_size >= 2) data2 = (ofs + 2 < binary_size) ? binary[ofs + 2] : 0;

        const instruction_size = 1 + data_size;

        const statement = Statement.create(addr, opcode, instruction, data, data2, address_mode, cycles, cross_page);

        if (instruction == 42) { statement.set_comment("return"); }
        else if (instruction == 41) { statement.set_comment("return from interrupt"); }
        else if (instruction == 35 || instruction == 36) { statement.set_comment("push to stack"); }
        else if (instruction == 37 || instruction == 38) { statement.set_comment("pull from stack"); }
        else if (instruction == 46) { statement.set_comment("disable interrupts"); }
        else if (instruction == 15) { statement.set_comment("enable interrupts"); }
        else if (opcode == 0xa2 && get(binary, ofs + 2) == 0xa0 && get(binary, ofs + 4) == 0x8e && get(binary, ofs + 7) == 0x8c) {
            const addr_1 = get(binary, ofs + 1) | (get(binary, ofs + 3) << 8);
            const addr_2 = get(binary, ofs + 5) | (get(binary, ofs + 6) << 8);
            const addr_3 = get(binary, ofs + 8) | (get(binary, ofs + 9) << 8);

            if (addr_2 == 0xfffe && addr_3 == 0xffff) {
                statement.set_comment("set hardware raster irq handler");
                statement.jump_address = addr_1;
            } else if (addr_2 == 0x0314 && addr_3 == 0x0315) {
                statement.set_comment("set kernal raster irq handler");
                statement.jump_address = addr_1;
            }
         } else if (opcode == 0x8c && get(binary, ofs + 3) == 0x8d) {
            const addr_1 = get(binary, ofs + 1) | (get(binary, ofs + 2) << 8);
            const addr_2 = get(binary, ofs + 4) | (get(binary, ofs + 5) << 8);

            if (addr_1 == 0xfffe && addr_2 == 0xffff) {
                statement.set_comment("set hardware raster irq handler");
                statement.jump_address = addr_1;
            } else if (addr_1 == 0x0314 && addr_2 == 0x0315) {
                statement.set_comment("set kernal raster irq handler");
                statement.jump_address = addr_1;
            }

        } else if (ofs + instruction_size < binary_size) {
            const next_opcode = binary[ofs + instruction_size];
            const next_opcode_info = OpcodeMap.get(next_opcode);
            if (next_opcode_info) {
                const next_instruction = next_opcode_info[1];
                if (instruction == 29 && next_instruction == 47) { statement.set_comment("load/store A"); }
                else if (instruction == 30 && next_instruction == 48) { statement.set_comment("load/store X"); }
                else if (instruction == 31 && next_instruction == 49) { statement.set_comment("load/store Y"); }
            }
        }

        statements.push(statement);
        ofs += instruction_size;
    }

    for (const statement of statements) {
        if (statement.is_jump() || statement.jump_address != null) {
            addr = statement.get_jump_addr();
            const jump_target = find_addr(statements, addr);
            if (jump_target) {
                statement.add_jump_target(jump_target);
                jump_target.add_ref(statement);
                if (!statement.is_jump()) {
                    jump_target.irq_handler = true;
                }
            }
        }
    }

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

    const outputs = [];

    for (const statement of statements) {

        if (statement.has_refs()) {
            if (!last_blank) write("empty", null);
            write("label", statement);
        }

        if (statement.type == 'buffer' && (!last_blank)) {
            write("empty", null);
        }

        last_blank = false;

        write(statement.type, statement);
        if (statement.type == "empty") last_blank = true;

        if (statement.is_return()) {
            if (!last_blank) {
                write("empty", null);
                last_blank = true;
            }
        }
    }

    return;
}

//-----------------------------------------------------------------------------------------------//
// Html Formatter
//-----------------------------------------------------------------------------------------------//

class Html {

    static tag(_class, _value, _fixedWidth) {

        let s = (_value||"").trim();
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

        const s = (txt||"").trim();
        if (txt.length == len) return txt;
        if (txt.length > len) txt.substring(0, len);

        const needed = len - txt.length;
        return txt + Html.spaces(needed);
    }

    static fixedRight(txt, len) {
        const s = (txt||"").trim();
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

        const addr = _addr;
        const hex = _hex;
        const comment = _comment;

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
    constructor() {
        this._outputBuffer = null;
    }

    disassembleFile(filename, options) {

        let fileType = FileType.Unknown;

        const ext = path.extname(filename).toLowerCase();
        if (ext == ".prg") {
            fileType = FileType.Prg;
        } else {
            throw("unsupported file format: " + ext);
        }

        if (!fs.existsSync(filename)) {
            throw ("" + filename + "does not exist or is invalid");
        }

        const binary = fs.readFileSync(filename);

        return this.disassemble(binary, options);
    }

    disassemble(binary) {

        if (binary == null) {
            throw("failed to read input file");
        }

        const instance = this;

        const Formatter = Html;

        this.#open();

        process(binary, (type, statement) => {
            instance.#write(Formatter, type, statement);
        });

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
            case 'empty': {
                line = Formatter.empty();
                break;
            }
            case 'label': {
                const label = statement.get_label_name() + LABEL_SUFFIX;
                line = Formatter.label(label);
                break;
            }
            case 'comment': {
                const comment = statement.comment;
                line = Formatter.comment(comment);
                break;
            }
            case 'meta': {
                const meta = statement.meta;
                const comment = statement.comment;
                line = Formatter.meta(meta, comment);
                break;
            }
            case 'opcode': {
                const addr = "$" + format16(statement.addr, true);

                const instruction = statement.getInstractionName();
                const params = statement.getInstructionParams();
                const jumpLabel = statement.getInstructionJumpLabel();
                const hex = statement.getInstructionHex();
                const comment = statement.comment;
                line = Formatter.opcode(instruction, params, jumpLabel, addr, hex, comment);
                break;
            }
            case 'invalid': {
                const addr = "$" + format16(statement.addr, true);
                const instruction = "???";
                const hex = statement.getInstructionHex();
                const comment = statement.comment;
                line = Formatter.opcode(instruction, null, null, addr, hex, comment);
            }
            case 'buffer': {
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
