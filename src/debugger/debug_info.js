//
// Debug Info
//

const path = require('path');
const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { Logger } = require('utilities/logger');
const { Utils, SortedArray } = require('utilities/utils');
const { Elf, ElfSymbol } = require('elf/elf');

const logger = new Logger("DebugInfo");

const DebugDumpAddressInfos = false;

//-----------------------------------------------------------------------------------------------//
// Types and Constants
//-----------------------------------------------------------------------------------------------//

const OPCODES =
    "adc,and,asl,bcc,bcs,beq,bit,bmi,bne,bpl,brk,bvc,bvs,clc,cld,cli,clv,cmp,cpx,cpy,dec,dex,"+
    "dey,eor,inc,inx,iny,jmp,jsr,lda,ldx,ldy,lsr,nop,ora,pha,php,pla,plp,rol,ror,rti,rts,sbc,"+
    "sec,sed,sei,sta,stx,sty,tax,tay,tsx,txa,txs,tya,";

//-----------------------------------------------------------------------------------------------//
// KickAssembler Info and C64Debugger Debug Info Parser
//-----------------------------------------------------------------------------------------------//

const KickDebugSectionTypes = {
    UNKNOWN :        0,
    LIBRARIES :      1,
    DIRECTIVES :     2,
    PPDIRECTIVES :   3,
    ERRORS :         4,
    SYNTAX :         5,
    FILES :          6,
    VERSION :        7
};

class KickAssemblerInfo {

    static read(filename) {
        const kickInfo = new KickAssemblerInfo();

        try {
            kickInfo.#parse(filename);
        } catch (err) {
            logger.error(err);
            return null;
        }

        return kickInfo;
    }

    constructor() {
        this._sections = null;
        this._currenctSection = null;
        this._files = null;
    }

    getErrors() {
        return this.#getSection(KickDebugSectionTypes.ERRORS);
    }

    #getSection(sectionType) {
        if (!this._sections) return null;
        const sectionObj = this._sections.get(sectionType);
        if (!sectionObj || !sectionObj.elements || sectionObj.elements.length < 1) return null;
        return sectionObj.elements;
    }

    #getFile(fileIndex) {
        const files = this._files;
        if (!files || fileIndex < 0 || fileIndex >= files.length) return null;
        const fileObj = files[fileIndex];
        if (!fileObj) return null;
        return fileObj.path;
    }

    #parse(filename) {
        let src = null;
        try {
            src = fs.readFileSync(filename, "utf8");
        } catch (err) {
            if (err.code == 'ENOENT') {
                throw("assembler info file " + filename + " does not exist");
            } else {
                throw("unable to read assembler info file '" + filename + "'");
            }
        }
        this.#parseInfo(src);
    }

    #parseInfo(src) {

        this._sections = new Map();

        let lines = src.split("\n");
        for (let line of lines) {
            const l = line.trim();
            this.#parseLine(l);
        }

        this.#resolve();
    }

    #parseLine(line) {
        if (!line || line.length < 1) return;

        if (line[0] == '[') {
            const sectionName = line.substring(1, line.length-1).toLowerCase();
            let sectionType = KickDebugSectionTypes.UNKNOWN;

            if (sectionName == "libraries") sectionType = KickDebugSectionTypes.LIBRARIES
            else if (sectionName == "directives") sectionType = KickDebugSectionTypes.DIRECTIVES
            else if (sectionName == "ppdirectives") sectionType = KickDebugSectionTypes.PPDIRECTIVES
            else if (sectionName == "errors") sectionType = KickDebugSectionTypes.ERRORS
            else if (sectionName == "syntax") sectionType = KickDebugSectionTypes.SYNTAX
            else if (sectionName == "files") sectionType = KickDebugSectionTypes.FILES
            else if (sectionName == "version") sectionType = KickDebugSectionTypes.VERSION
            else {
                this.currentSection = null; // unknown section
            }

            const section = {
                name: sectionName,
                type: sectionType,
                elements: []
            };

            this._sections.set(sectionType, section);
            this._currenctSection = section;

            return;
        }

        const section = this._currenctSection;
        if (!section) return;

        const elements = section.elements;

        const sectionType = section.type;

        if (sectionType == KickDebugSectionTypes.FILES) {
            const pos = line.indexOf(';');
            if (pos == -1) return; // invalid line

            let fileIndex = parseInt(line.substring(0, pos));
            if (isNaN(fileIndex) || fileIndex < 0) return; // invalid index

            const fileName = line.substring(pos+1);

            //if (fileName.toLowerCase().startsWith("KickAss.jar")) return; // skip files in jar

            const element = {
                index: fileIndex,
                path: fileName
            }

            elements.push(element);

        } else if (sectionType == KickDebugSectionTypes.SYNTAX) {

            const pos = line.indexOf(';');
            if (pos == -1) return; // invalid line

            const operator = line.substring(0, pos);
            const rangeSpec = line.substring(pos+1);

            const element = {
                operator: operator,
                range: this.#parseRange(rangeSpec)
            };

            elements.push(element);

        } else if (sectionType == KickDebugSectionTypes.ERRORS) {

            // example: "Error;15,5,15,10,0;Invalid directive"

            const pos = line.indexOf(';');
            if (pos == -1) return; // invalid line

            const level = line.substring(0, pos).trim();

            const pos2 = line.indexOf(';', pos+1);
            if (pos2 <= pos) return; // invalid line

            const rangeSpec = line.substring(pos+1, pos2).trim();
            const message = line.substring(pos2+1).trim();

            const element = {
                level: level,
                range: this.#parseRange(rangeSpec),
                message: message,
                filename: null // unresolved
            };

            elements.push(element);
        }

    }

    #parseRange(rangeSpec) {

        if (!rangeSpec || rangeSpec.length < 1) return null;

        const rangeInfo = rangeSpec.split(',');
        if (!rangeInfo || rangeInfo.length < 5) return null;

        const range = {
            startLine: parseInt(rangeInfo[0]),
            startPosition: parseInt(rangeInfo[1]),
            endLine: parseInt(rangeInfo[2]),
            endPosition: parseInt(rangeInfo[3]),
            fileIndex: parseInt(rangeInfo[4])
        };

        return range;
    }

    #resolve() {
        this._currenctSection = null;
        this._files = this.#getSection(KickDebugSectionTypes.FILES);

        const errors = this.#getSection(KickDebugSectionTypes.ERRORS);
        if (errors && errors) {
            for (const error of errors) {
                if (!error.range) continue;
                error.filename = this.#getFile(error.range.fileIndex);
            }
        }
    }

}

class BasicMapParser {

    constructor(project, src) {
        this.project = project;
        this.src = src;

        // dbg data
        this.sources = [];
        this.labels = [];
        this.addr = [];
    }

    parse() {

        const src = this.src;

        let currentSource = null;

        const sourceSet = new Set()
        let fileIndex = 0;

        let lines = src.split("\n").filter(s => (s.trim().length > 0));
        for (const raw_line of lines) {
            const line = raw_line.trim();
            const line_items = line.split(",");
            if (!line_items || line_items.length < 1) continue;
            if (line_items.length == 1) {
                currentSource = line_items[0];
                if (!sourceSet.has(currentSource)) {
                    sourceSet.add(currentSource);
                    this.sources.push(currentSource);
                    fileIndex = this.sources.length - 1;
                } else {
                    fileIndex = this.sources.indexOf(currentSource);
                }
            } else if (line_items.length >= 5 && currentSource != null) {

                let i = 0;
                const startAddr = parseInt(line_items[i++], 10);
                const endAddr = parseInt(line_items[i++], 10);
                const basicLine = parseInt(line_items[i++], 10);
                const line = parseInt(line_items[i++], 10);
                const lineLen = parseInt(line_items[i++], 10);

                const addr = {

                    startAddr: startAddr,
                    endAddr: endAddr,
                    fileIndex: fileIndex,
                    startLine: line,
                    startPosition: 0,
                    endLine: line,
                    endPosition: lineLen

                };

                this.addr.push(addr);

                /*
                this.labels.push({
                    addr: startAddr,
                    name: basicLine.toString()
                });
                */

            }
        }

        return {
            sources: this.sources,
            labels: this.labels,
            addr: this.addr
        };

    }
}

class KickDebugParser {

    constructor(project, src) {
        this.project = project;
        this.src = src;

        // dbg data
        this.sources = [];
        this.labels = [];
        this.addr = [];
    }

    parse() {

        const thisInstance = this;

        const src = this.src;

        let data = null;

        try {
            const parser = new XMLParser();
            const xml = parser.parse(src);
            if (xml) data = xml.C64debugger;
        } catch (err) {
            throw("unable to read debug database file: " + err);
        }

        if (!data) throw("unable to read debug database file");

        this.visit(data.Sources, (sources) => {
            const sourceEntries = sources.split('\n');
            for (const src of sourceEntries) {
                const pos = src.indexOf(',');
                if (pos == -1) continue;
                //const fileIndex = parseInt(src.substring(0, pos).trim(), 10);
                const fileName = src.substring(pos+1).trim();
                if (!fileName.toLowerCase().startsWith("kickass.jar:")) {
                    const normalizedFileName = Utils.normalizePath(fileName);
                    this.sources.push(normalizedFileName);
                } else {
                    this.sources.push(fileName);
                }
            }
        });

        this.visit(data.Labels, (labels) => {
            const labelEntries = labels.split('\n');
            for (const label of labelEntries) {
                const info = label.split(',');
                if (!info || info.length < 3) continue;

                const segment = info[0].trim().toLowerCase();
                const addr = parseInt(info[1].substring(1).trim(), 16);
                const name = info[2].trim();

                this.labels.push({
                    segment: segment,
                    addr: addr,
                    name: name
                });
            }
        });

        this.visit(data.Segment, (segment) => {
            thisInstance.visit(segment.Block, (blocks) => {
                const blockEntries = blocks.split('\n');
                for (const block of blockEntries) {

                    const info = block.split(',');
                    if (!info || info.length < 7) return;

                    const startAddr = parseInt(info[0].trim().substring(1), 16);
                    const endAddr = parseInt(info[1].trim().substring(1), 16);
                    const fileIndex = parseInt(info[2].trim(), 10);
                    const startline = parseInt(info[3].trim(), 10);
                    const startposition = parseInt(info[4].trim(), 10);
                    const endline = parseInt(info[5].trim(), 10);
                    const endposition = parseInt(info[6].trim(), 10);

                    const addr = {

                        startAddr: startAddr,
                        endAddr: endAddr,
                        fileIndex: fileIndex,
                        startLine: startline,
                        startPosition: startposition,
                        endLine: endline,
                        endPosition: endposition

                    };

                    thisInstance.addr.push(addr);
                }

            })
        });

        return {
            sources: this.sources,
            labels: this.labels,
            addr: this.addr
        };

    }

    visit(itemOrArray, visitor) {
        if (!itemOrArray) return;

        if (Array.isArray(itemOrArray)) {
            for (const childItem of itemOrArray) {
                if (childItem) visitor(childItem);
            }
        } else {
            visitor(itemOrArray);
        }
    }

}


//-----------------------------------------------------------------------------------------------//
// CC65 Debug Info Parser
//-----------------------------------------------------------------------------------------------//

const _DebugTypes_ = {
    VOID :          0,
    BYTE :          1,
    WORD :          2,
    DBYTE :         3,
    DWORD :         4,
    PTR :           5,
    FARPTR :        6,
    ARRAY :         7,
    UNION :         8,         // unused
    STRUCT :        9,         // unused
    FUNC :          10         // unused
};

const DebugLineTypes = {
    ASM:            0,          // default
    C:              1,
    MACRO:          2
};

const _DebugCSymbolTypes_ = {
    FUNC:           0,
    VAR:            1
};

const _DebugCSymbolStorageTypes_ = {
    AUTO:           0,      // "auto" = STACK
    REGISTER:       1,
    STATIC:         2,
    EXTERN:         3
};

const _DebugScopeTypes_ = {
    GLOBAL:         0,
    MODULE:         1,
    SCOPE:          2,
    STRUCT:         3,
    ENUM:           4
};

const _DebugSymbolTypes_ = {
    EQUATE:         0,
    LABEL:          1,
    IMPORT:         2
};

class Cc65DebugParser {

    static getNumber(map, key, defaultValue) {
        const value = map.get(key);
        if (!value) return defaultValue;
        return parseInt(value);
    }

    static getNumberHex(map, key, defaultValue) {
        const value = map.get(key);
        if (!value) return defaultValue;
        return parseInt(value, 16);
    }

    static getNumbers(map, key, defaultValue) {
        const values = map.get(key);
        if (!values) return defaultValue;
        const valueArr = values.split('+');
        const numbers = [];
        for (const value of valueArr) {
            numbers.push(parseInt(value));
        }
        if (numbers.length < 1) return defaultValue;
        return numbers;
    }

    static decode(key, value) {
        if (!key || !value) return null;

        let result = null;

        if (value.length >= 2 && value[0]=='\"' && value[value.length-1]=='\"') {
            return value.substring(1, value.length-1);
        }

        if (key == "name") {
            result = value;
        } else if (key == "addsize") {
            result = value; // absolute | zeropage (??)
        } else {
            if (value.indexOf('+') >= 0) {
                const list = value.split('+');
                const values = [];
                for (const element of list) {
                    values.push(parseInt(element));
                }
                if (values.length > 0) result = values;
            } else {
                if (value.startsWith('0x')) {
                    result = parseInt(value.substring(2), 16);
                } else if (value.startsWith('$')) {
                    result = parseInt(value.substring(1), 16);
                } else {
                    let isNumber = true;
                    for (const c of value) {
                        if (c < '0' || c > '9') {
                            isNumber = false;
                            break;
                        }
                    }

                    if (isNumber) {
                        result = parseInt(value);
                    } else {
                        result = value;
                    }

                }
            }
        }

        return result;

    }

    static parseLine(line) {
        if (!line || line.length < 1) return null;

        let pos = line.indexOf('\t');
        if (pos < 0) pos = line.indexOf(' ');
        if (pos < 0) return null;

        const key = line.substring(0, pos);
        const data = line.substring(pos+1);
        const elements = data.split(',');
        const attributes = new Map();
        for (const element of elements) {
            const [k, v] = element.split('=');
            if (k && v) {
                const rawValue = v.trim();
                const decodedValue = Cc65DebugParser.decode(k, rawValue);
                if (decodedValue != null) attributes.set(k, decodedValue);
            }
        }

        let statement = {
            key: key
        };

        for (const [k, v] of attributes) {
            statement[k] = v;
        }

        return statement;
    }

    static addLineToSpan(span, lineInfo) {

        if (!span.lineInfos) {
            span.lineInfos = new SortedArray({ key: (a) => { return a.line; } });
        }

        span.lineInfos.push(lineInfo);
    }

    static addScopeToSpan(span, scopeInfo) {
        if (!span.scopeInfos) {
            span.scopeInfos = [];
        }
        span.scopeInfos.push(scopeInfo);
    }

    static addCSymToScope(csym, scope) {
        if (!scope.csymInfos) {
            scope.csymInfos = [];
        }
        scope.csymInfos.push(csym);
    }

    static scan(src) {

        const data = {
            csyms: [],
            files: [],
            libs: [],
            lines: [],
            mods: [],
            segs: [],
            spans: [],
            scopes: [],
            syms: [],
            types: []
        };

        let lines = src.split("\n").filter(s => (s.trim().length > 0));
        for (let line of lines) {
            const statement = Cc65DebugParser.parseLine(line);
            if (!statement || !statement.key) continue;

            const collection = data[statement.key + "s"];
            if (!collection) {
                //console.log("unknown type: " + statement.key + "s");
                continue;
            }

            collection.push(statement);
        }

        return data;

    }

    static resolve(project, data) {

        let codeSegmentId = 0;

        for (const segment of data.segs) {
            if (segment.name == "CODE") {
                codeSegmentId = segment.id;
                break;
            }
        }

        for (const file of data.files) {
            if (project) {
                const filePath = project.resolveFile(file.name);
                if (!filePath) {
                    continue;
                }
            }
        }

        for (const scope of data.scopes) {
            if (scope.span == null) continue;

            if (scope.parent != null) {
                const parent = data.scopes[scope.parent];
                if (parent) {
                    scope.parentScope = parent;
                    if (!parent.childScopes) {
                        parent.childScopes = [];
                    }
                    parent.childScopes.push(scope);
                }
            }

            if (Array.isArray(scope.span)) {
                for (const spanId of scope.span) {
                    const span = data.spans[spanId];
                    Cc65DebugParser.addScopeToSpan(span, scope);
                }
            } else {
                const span = data.spans[scope.span];
                Cc65DebugParser.addScopeToSpan(span, scope);
                scope.spanInfo = span;
            }
        }

        for (const csym of data.csyms) {
            if (csym.scope == null) continue;
            const scope = data.scopes[csym.scope];
            if (scope) {
                Cc65DebugParser.addCSymToScope(csym, scope);
            }
        }

        for (const line of data.lines) {
            if (line.span == null) continue;

            if (Array.isArray(line.span)) {
                for (const spanId of line.span) {
                    const span = data.spans[spanId];
                    Cc65DebugParser.addLineToSpan(span, line);
                }
            } else {
                const span = data.spans[line.span];
                Cc65DebugParser.addLineToSpan(span, line);
            }
        }

        const addresses = new SortedArray({
            less: (a, b) => {
                if (a.type == DebugLineTypes.C && b.type == DebugLineTypes.ASM) return true;
                return (a.address < b.address);
            },
            key: (a) => { return a.address; }
        });

        const spans = new SortedArray({ key: (a) => { return a.address; }});

        for (const span of data.spans) {

            if (span.seg == null) continue;

            const segment = data.segs[span.seg];
            span.segment = segment;
            span.address = segment.start + span.start;

            if (span.seg == codeSegmentId) {
                spans.push(span);
            }

            if (!span.lineInfos) continue;

            for (const lineInfo of span.lineInfos) {

                if (!lineInfo || lineInfo.file == null) {
                    continue;
                }

                const seg = data.segs[span.seg];
                const addr = seg.start + span.start;
                const addrEnd = addr + span.size - 1;
                const size = span.size;

                const file = data.files[lineInfo.file];
                if (project && !project.isSource(file.name)) {
                    continue; // ignore non-project files
                }

                const line = lineInfo.line;

                const addrInfo = new DebugAddressInfo(
                    addr,
                    addrEnd,
                    file.name,
                    line
                );

                addrInfo.lineType = lineInfo.type;
                addrInfo.size = size;
                addrInfo.span = span;

                addresses.push(addrInfo);
            }

        }

        const symbols = new Map();
        for (const sym of data.syms) {
            if (sym.scope == 0 && sym.val != null && sym.type == "lab") {
                // store label symbols (addresses)
                const val = parseInt(sym.val);
                symbols.set(sym.name, new DebugSymbol(sym.name, val, true));
            }
        }

        const dbg = {
            spans: spans,
            addressInfos: addresses.elements,
            symbols: symbols
        };

        return dbg;
    }

    static parse(project, src) {

        const data = Cc65DebugParser.scan(src);
        const dbg = Cc65DebugParser.resolve(project, data);

        return dbg;
    }

}

//-----------------------------------------------------------------------------------------------//
// ACME Debug Report Parser
//-----------------------------------------------------------------------------------------------//

const ReportElementType = {
    ASTERISK: 1,
    EQUALS: 2,
    COMMA: 3,
    KEYWORD_ADDR: 4,
    DATA_SIZE: 5,
    NUMBER: 10,
    SYMBOL: 11,
    LABEL: 12,
    ADDRESS: 13,
    SOURCE: 14,
    DATA: 15,
    SCOPE_BEGIN: 16,
    SCOPE_END: 17,
    MACRO: 18,
    KEYWORD_SET: 19
};

const ReportStatementType = {
    LABEL: 1,
    SYMBOL: 2,
    ADDRESS: 3,
    SCOPE_END: 4,
    MACRO_BEGIN: 5
};

class ReportParser {

    constructor(project) {
        this.project = project;
        this.sources = project.getAsmSourceFiles();
        this.sourceIndex = 0;
    }

    scan(line) {
        const project = this.project;
        const sources = this.sources;

        const tokens = [];
        let source = null;
        let comment = null;

        {
            let i=0;

            while (i<line.length) {

                while (i<line.length && " \t\r\n".indexOf(line[i])>=0) { i++; }

                if (line[i] == ';') {

                    let j = line.indexOf("Source:", i+1);
                    if (j >= 0) {
                        const relPath = line.substring(j+7).trim();
                        const absPath = project.resolveFile(relPath);
                        if (absPath) {
                            source = Utils.normalizePath(absPath);
                        }
                    } else {
                        comment = line.substring(i+1);
                    }
                    break;
                }

                if (line.charCodeAt(i) == 65533) {
                    i++; // ignore '�' char at the beginning of a new file

                    if (sources && this.sourceIndex < sources.length - 1) {
                        this.sourceIndex++;
                        const sourceItem = sources[this.sourceIndex];
                        source = Utils.normalizePath(sourceItem);
                    }

                } else if ("=,".indexOf(line[i]) >= 0) {
                    tokens.push(line[i]);
                    i++;
                } else if (line[i] == ':') {
                    i++; // ignore any ':'
                } else {
                    let pos1 = i;
                    while (i<line.length && " \t\r\n,=;:".indexOf(line[i])<0) { i++; }

                    // break after '...' in long code line to find label
                    //    22  081b c4554d4220455841....string  !pet "Dumb example", 13, 0
                    if (tokens.length == 2) {
                        let posDots = line.indexOf('...',pos1);
                        if (posDots > 0 && posDots < i) {
                            i = posDots + 3;
                        }
                    }

                    let pos2 = i;
                    if (pos2>pos1) {
                        tokens.push(line.substring(pos1, pos2));
                    }
                }
            }
        }

        return {
            tokens: tokens,
            source: source,
            comment: comment
        };
    }

    lex(tokens) {
        const elements = [];

        let isCodeLine = false;

        {
            let i=0;

            while (i<tokens.length) {

                let token = tokens[i++];
                let element = null;

                if (token == '*') {
                    element = { type: ReportElementType.ASTERISK, desc: "asterisk" };
                } else if (token == '=') {
                    element = { type: ReportElementType.EQUALS, desc: "equals" };
                } else if (token == ',') {
                    element = { type: ReportElementType.COMMA, desc: "comma" };
                } else if (token == '{') {
                    element = { type: ReportElementType.SCOPE_BEGIN, desc: "scope-begin" };
                } else if (token == '}') {
                    element = { type: ReportElementType.SCOPE_END, desc: "scope-end" };
                } else if (token == '!macro') {
                    element = { type: ReportElementType.MACRO, desc: "macro" };
                } else if (token == '!addr') {
                    element = { type: ReportElementType.KEYWORD_ADDR, desc: "keyword-addr" };
                } else if (token == '!set') {
                    element = { type: ReportElementType.KEYWORD_SET, desc: "keyword-set" };
                } else if (token == '!pet') {
                    element = { type: ReportElementType.DATA_SIZE, value: 8, desc: "data-size" };
                } else if (token == '!byte') {
                    element = { type: ReportElementType.DATA_SIZE, value: 8, desc: "data-size" };
                } else if (token == '!08') {
                    element = { type: ReportElementType.DATA_SIZE, value: 8, desc: "data-size" };
                } else if (token == '!word') {
                    element = { type: ReportElementType.DATA_SIZE, value: 16, desc: "data-size" };
                } else if (token == '!16') {
                    element = { type: ReportElementType.DATA_SIZE, value: 16, desc: "data-size" };
                } else if (token == '!24') {
                    element = { type: ReportElementType.DATA_SIZE, value: 24, desc: "data-size" };
                } else if (token == '!32') {
                    element = { type: ReportElementType.DATA_SIZE, value: 32, desc: "data-size" };
                } else {

                    let num = this.parseNumber(token);

                    if (1 == i) {
                        if (null == num) {
                            break; // invalid line or just comment
                        }

                        element = { type: ReportElementType.NUMBER, value: num, desc: "number" };
                    } else {

                        // Note: The check for i<tokens.length (for labels) and "=" (for symbols) will make
                        //  a hex letters only token like 'cafe' be detected as unknown instead of address
                        if (2 == i && null != num && i < tokens.length && tokens[i] != "=") {
                            isCodeLine = true;
                            element = { type: ReportElementType.ADDRESS, value: this.parseNumber(token, true), desc: "address" };
                        } else if ( 3 == i && isCodeLine) {
                            element = { type: ReportElementType.DATA, value: token, desc: "data" };
                        } else if ( 4 == i && isCodeLine && this.isValidSymbol(token)) {
                            element = { type: ReportElementType.SYMBOL, name: token, desc: "symbol" };
                        } else {
                            element = { type: ReportElementType.UNKNOWN, value: token, desc: "unknown" };
                        }

                    }
                }

                if (null != element) {
                    element.token = token;
                    elements.push(element);
                }
            }
        }

        return elements;
    }

    parseLine(line) {

        const parseResult = this.scan(line);
        if (!parseResult) return null;

        const tokens = parseResult.tokens;
        const elements = this.lex(tokens);

        const statements = [];

        if (null != parseResult.source) {

            const statement = {
                type: ReportStatementType.SOURCE,
                path: parseResult.source,
                desc: "source"
            };

            statements.push(statement);
        }

        let statement = null;

        if (elements.length == 2 && elements[1].type == ReportElementType.UNKNOWN) {

            statement = {
                type: ReportStatementType.LABEL,
                name: elements[1].value,
                line: elements[0].value,
                desc: "label"
            };

        } else if (elements.length >= 4 &&
            elements[1].type == ReportElementType.MACRO &&
            elements[elements.length-1].type == ReportElementType.SCOPE_BEGIN) {

            statement = {
                type: ReportStatementType.MACRO_BEGIN,
                name: elements[2].value,
                desc: "macro"
            };

        } else if (elements.length >= 2 &&
            elements[1].type == ReportElementType.SCOPE_END) {

            statement = {
                type: ReportStatementType.SCOPE_END,
                desc: "scope-end"
            };

        } else if (elements.length >= 4 &&
            elements[1].type == ReportElementType.UNKNOWN &&
            elements[2].type == ReportElementType.EQUALS &&
            elements[3].type == ReportElementType.UNKNOWN) {

            const num = this.parseNumber(elements[3].value);
            if (null != num) {

                statement = {
                    type: ReportStatementType.SYMBOL,
                    name: elements[1].value,
                    value: num,
                    isAddress: (num >= 0x100),
                    line: elements[0].value,
                    desc: "symbol"
                };

            }

        } else if (elements.length >= 5 &&
            elements[1].type == ReportElementType.KEYWORD_ADDR &&
            elements[2].type == ReportElementType.UNKNOWN &&
            elements[3].type == ReportElementType.EQUALS &&
            elements[4].type == ReportElementType.UNKNOWN) {

            // parsing "!addr symbol = value" assignments (expressions are not supported, yet)

            const num = this.parseNumber(elements[4].value);
            if (null != num) {
                statement = {
                    type: ReportStatementType.SYMBOL,
                    name: elements[2].value,
                    value: num,
                    isAddress: true,
                    line: elements[0].value,
                    desc: "symbol"
                };
            }

        } else if (elements.length >= 5 &&
            elements[1].type == ReportElementType.KEYWORD_SET &&
            elements[2].type == ReportElementType.UNKNOWN &&
            elements[3].type == ReportElementType.EQUALS &&
            elements[4].type == ReportElementType.UNKNOWN) {

            // parsing "!set symbol = value" assignments (expressions are not supported, yet)

            const num = this.parseNumber(elements[4].value);
            if (null != num) {
                statement = {
                    type: ReportStatementType.SYMBOL,
                    name: elements[2].value,
                    value: num,
                    data_size: 8,
                    isAddress: false,
                    line: elements[0].value,
                    desc: "symbol"
                };
            }

        } else if (elements.length >= 2 &&
                   elements[1].type == ReportElementType.UNKNOWN) {

            const num = this.parseNumber(elements[1].value, true);
            if (null != num) {
                statement = {
                    type: ReportStatementType.ADDRESS,
                    value: num,
                    line: elements[0].value,
                    desc: "address"
                };
            }

        } else if (elements.length >= 2 &&
            elements[1].type == ReportElementType.ADDRESS) {

            statement = {
                type: ReportStatementType.ADDRESS,
                value: elements[1].value,
                line: elements[0].value,
                desc: "address"
            };

            if (elements[3] && elements[3].type == ReportElementType.SYMBOL) {
                statement.symbol = elements[3].name;

                if (elements[4] && elements[4].type == ReportElementType.DATA_SIZE) {
                    statement.data_size = elements[4].value;
                }
            }

        }

        if (statement) {
            statement.details = {
                raw: line,
                comment: parseResult.comment,
                tokens: tokens,
                elements: elements
            };

            statements.push(statement);
        }

        if (statements.length < 1) return null;

        return statements;
    }

    isValidSymbol(token) {
        if (token.charAt(0) != '.' && token.charAt(0) != '_') {
            let ch = token.charAt(0).toLowerCase();
            if (ch < 'a' || ch > 'z' || (token.length == 3 && OPCODES.indexOf(token.toLowerCase()) >= 0)) {
                return false;
            }
        }
        return true;
    }

    parseNumber(s, hex) {

        if (null == s) return null; // empty
        if (s.length > 16) return null; // overflow

        let value = 0;
        let hexValue = 0;

        let isHex = hex;
        let isNegative = false;

        let i = 0;

        if (s[i] == '-') {
            isNegative = true;
            i++;
        } else if (s[i] == '+') {
            i++;
        }

        if (s[i] == '$') {
            isHex = true;
            i++;
        } else if (s[i] == '0' && s[i+1] == 'x') {
            isHex = true;
            i+=2;
        }

        while (i<s.length) {

            let c = s[i++];

            let digit = 0;

            if (c >= '0' && c <= '9') {
                digit = (c-'0');
            } else if (c >= 'a' && c <= 'f') {
                digit = 10 + (c.charCodeAt(0)-'a'.charCodeAt(0));
                isHex = true;
            } else if (c >= 'A' && c <= 'F') {
                digit = 10 + (c.charCodeAt(0)-'A'.charCodeAt(0));
                isHex = true;
            } else {
                return null; // illegal character
            }

            if (!isHex) value = (value * 10) + digit;
            hexValue = (hexValue * 16) + digit;

        }

        let result = (isHex ? hexValue : value);
        if (isNegative) result = -result;

        return result;
    }

}

//-----------------------------------------------------------------------------------------------//
// Debug Info
//-----------------------------------------------------------------------------------------------//

class DebugSymbol {
    constructor(name, value, isAddress, source, line, data_size, memory_size) {
        this.name = name;
        this.value = value;
        this.isAddress = isAddress;
        this.source = source;
        this.line = line;
        this.data_size = data_size||0;
        this.memory_size = memory_size||0;
    }
}

class DebugLabel {
    constructor(name, address, source, line) {
        this.name = name;
        this.address = address;
        this.source = source;
        this.line = line;
    }
}

class _DebugFileInfo_ {
    constructor(name, size, type) {
        this.name = name;
        this.size = size;
        this.type = type || DebugLineTypes.ASM;
    }
}

class DebugAddressInfo {
    constructor(address, address_end, source, line) {
        this.address = address;
        this.address_end = address_end ? address_end : address;
        this.source = source != null ? path.resolve(path.normalize(source)) : null;
        this.normalizedPath = source != null ? Utils.normalizePath(source) : null;
        this.line = line;
        this.globalRef = null;
        this.localRef = null;
        this.localRefTable = null;
        this.debugSymbols = null;
        this.debugLabels = null;

        this.lineType = null;
        this.size = null;
    }

    isHighLevel() {
        if (!this.lineType) return false;
        return (this.lineType == DebugLineTypes.C);
    }

    compare(address, line) {
        if (address != null) {
            if (this.address > address) return 1;
            else if (this.address_end < address) return -1;
        } else if (line != null) {
            if (this.line > line) return 1;
            else if (this.line < line) return -1;
        }
        return 0;
    }

    addDebugSymbol(debugSymbol) {
        if (!this.debugSymbols) {
            this.debugSymbols = [ debugSymbol ];
        } else {
            this.debugSymbols.push(debugSymbol);
        }
    }

    addDebugLabel(debugLabel) {
        if (!this.debugLabels) {
            this.debugLabels = [ debugLabel ];
        } else {
            this.debugLabels.push(debugLabel);
        }
    }

    findLabel() {
        let item = this;

        while (item) {
            if (item.debugLabels && item.debugLabels.length > 0) {
                return item.debugLabels[0];
            }

            if (item.localRefTable && item.localRef != null && item.localRef > 0) {
                item = item.localRefTable[item.localRef-1];
            } else {
                break;
            }
        }

        return null;
    }
}

class DebugInfo {

    constructor(filename, project) {

        this._labels = null;
        this._symbols = null;
        this._spans = null;
        this._addresses = [];
        this._lineListByFile = new Map();
        this._supportsScopes = null;
        this._hasCStack = null;
        this._timestamp = null;
        this._filename = null;

        // using array instead of map for
        // real constant time access
        // (whereas hashing might be a problem)
        this._addressMap = new Array(0x1000);

        this.#load(filename, project);
    }

    get timestamp() {
        return this._timestamp;
    }

    get filename() {
        return this._filename;
    }

    get supportsScopes() {
        return (this._supportsScopes == true);
    }

    get hasCStack() {
        return (this._hasCStack == true);
    }

    #load(filename, project) {

        const toolkit = project.toolkit;
        const debugInfoType = filename != null ? path.extname(filename).toLowerCase() : null;

        if (toolkit.isBasic) {
            this.#loadBasicDebug(filename, project);
        } else if (debugInfoType == ".report") {
            this.#loadAcmeReport(filename, project);
        } else if (debugInfoType == ".elf") {
            this.#loadElf(filename, project);
        } else if (debugInfoType == ".dbg") {
            if (toolkit.isKick) {
                this.#loadKickDbg(filename, project);
            } else {
                this.#loadCc65Dbg(filename, project);
            }
        }

        this.#resolve();

        this._filename = filename;
        this._timestamp = Utils.getFileTime(filename);
    }

    #getOrCreateLineList(filename) {
        let list = this._lineListByFile.get(filename);

        if (null == list) {
            list = new SortedArray({
                key: (a) => { return a.line; }
            });
            this._lineListByFile.set(filename, list);
        }

        return list;
    }

    #loadBasicDebug(filename, project) {
        let src = null;

        try {
            src = fs.readFileSync(filename, "utf8");
        } catch (err) {
            if (err.code == 'ENOENT') {
                throw("label file " + filename + " does not exist");
            } else {
                throw("unable to read debug database file '" + filename + "'");
            }
        }

        const parser = new BasicMapParser(project, src);
        const dbg = parser.parse();

        if (!dbg || !dbg.sources) throw("unable to read basic source map file");

        for (const entry of dbg.sources) {
            const normalizedPath = this.#getRefName(entry);
            this.#getOrCreateLineList(normalizedPath);
        }

        if (dbg.addr) {
            for (const entry of dbg.addr) {

                const filename = dbg.sources[entry.fileIndex];

                const addressInfo = new DebugAddressInfo(
                    entry.startAddr,
                    entry.endAddr,
                    filename,
                    entry.startLine + 1
                );

                addressInfo.globalRef = this._addresses.length;
                this._addresses.push(addressInfo);

                for (let addr = addressInfo.address; addr <= addressInfo.address_end; addr++) {
                    this._addressMap[addr] = addressInfo;
                }

                const normalizedPath = this.#getRefName(filename);
                const currentSourceRef = this.#getOrCreateLineList(normalizedPath);
                if (null != currentSourceRef) {
                    addressInfo.localRef = currentSourceRef.length;
                    addressInfo.localRefTable = currentSourceRef;
                    currentSourceRef.push(addressInfo);
                }

            }
        }

        if (dbg.labels) {
            for (const entry of dbg.labels) {
                this.storeSymbol(new DebugSymbol(
                    entry.name,
                    entry.addr,
                    true
                ));
            }
        }
    }

    #loadElf(filename, _project_) {

        let elf = null;

        try {
            elf = new Elf();
            elf.load(filename);
        } catch (err) {
            if (err.code == 'ENOENT') {
                throw("ELF file " + filename + " does not exist");
            } else {
                throw("unable to read debug database file '" + filename + "'");
            }
        }

        { // load source line information

            const section = elf.getSection(".debug_line");
            if (section) {
                const entries = section.entries;
                if (entries) {
                    for (const entry of entries) {

                        const addressInfo = new DebugAddressInfo(
                            entry.address,
                            entry.address_end,
                            entry.source,
                            entry.line
                        );

                        if (DebugDumpAddressInfos) {
                            console.log(
                                "$" + addressInfo.address.toString(16) +
                                "-$" + addressInfo.address_end.toString(16) +
                                ", " + addressInfo.source +
                                ":" + addressInfo.line
                            );
                        }

                        addressInfo.globalRef = this._addresses.length;
                        this._addresses.push(addressInfo);

                        for (let addr = addressInfo.address; addr <= addressInfo.address_end; addr++) {
                            this._addressMap[addr] = addressInfo;
                        }

                        const normalizedPath = addressInfo.normalizedPath;

                        let currentSourceRef = this.#getOrCreateLineList(normalizedPath);
                        addressInfo.localRef = currentSourceRef.length;
                        addressInfo.localRefTable = currentSourceRef;
                        currentSourceRef.push(addressInfo);
                    }
                }
            }
        }

        {  // load symbol table

            const section = elf.getSection(".symtab");
            if (section) {
                const numSymbols = section.getSymbolCount();
                for (let i=0; i<numSymbols; i++) {
                    const symbol = section.getSymbol(i);
                    if (symbol.name && symbol.type == ElfSymbol.TypeObject) {
                        //console.log("Symbol: " + symbol.name + "  Value: " + symbol.value + "  Size: " + symbol.size);
                        this.storeSymbol(new DebugSymbol(
                            symbol.name,
                            symbol.value,
                            true,
                            null,
                            0,
                            0, // data size type (8bit, 16bit, ...) is unknown (TODO)
                            symbol.size
                        ));
                    }
                }
            }
        }
    }

    #loadKickDbg(filename, project) {

        let src = null;

        try {
            src = fs.readFileSync(filename, "utf8");
        } catch (err) {
            if (err.code == 'ENOENT') {
                throw("label file " + filename + " does not exist");
            } else {
                throw("unable to read debug database file '" + filename + "'");
            }
        }

        const parser = new KickDebugParser(project, src);
        const dbg = parser.parse();

        if (!dbg || !dbg.sources) throw("unable to read debug database file");

        for (const entry of dbg.sources) {
            const normalizedPath = this.#getRefName(entry);
            this.#getOrCreateLineList(normalizedPath);
        }

        if (dbg.addr) {
            for (const entry of dbg.addr) {

                const filename = dbg.sources[entry.fileIndex];

                const addressInfo = new DebugAddressInfo(
                    entry.startAddr,
                    entry.endAddr,
                    filename,
                    entry.startLine
                );

                addressInfo.globalRef = this._addresses.length;
                this._addresses.push(addressInfo);

                for (let addr = addressInfo.address; addr <= addressInfo.address_end; addr++) {
                    this._addressMap[addr] = addressInfo;
                }

                const normalizedPath = this.#getRefName(filename);
                const currentSourceRef = this.#getOrCreateLineList(normalizedPath);
                if (null != currentSourceRef) {
                    addressInfo.localRef = currentSourceRef.length;
                    addressInfo.localRefTable = currentSourceRef;
                    currentSourceRef.push(addressInfo);
                }

            }
        }

        if (dbg.labels) {
            for (const entry of dbg.labels) {
                this.storeSymbol(new DebugSymbol(
                    entry.name,
                    entry.addr,
                    true
                ));
            }
        }
    }

    #loadCc65Dbg(filename, project) {

        let src = null;

        try {
            src = fs.readFileSync(filename, "utf8");
        } catch (err) {
            if (err.code == 'ENOENT') {
                throw("label file " + filename + " does not exist");
            } else {
                throw("unable to read debug database file '" + filename + "'");
            }
        }

        const dbg = Cc65DebugParser.parse(project, src);

        const addressInfos = dbg.addressInfos;

        for (const addressInfo of addressInfos) {

            if (DebugDumpAddressInfos) {
                console.log(
                    "$" + addressInfo.address.toString(16) +
                    "-$" + addressInfo.address_end.toString(16) +
                    ", " + addressInfo.source +
                    ":" + addressInfo.line
                );
            }

            addressInfo.globalRef = this._addresses.length;
            this._addresses.push(addressInfo);

            for (let addr = addressInfo.address; addr <= addressInfo.address_end; addr++) {
                this._addressMap[addr] = addressInfo;
            }

            const normalizedPath = addressInfo.normalizedPath;

            let currentSourceRef = this.#getOrCreateLineList(normalizedPath);
            addressInfo.localRef = currentSourceRef.length;
            addressInfo.localRefTable = currentSourceRef;
            currentSourceRef.push(addressInfo);

        }

        this._symbols = dbg.symbols;
        this._spans = dbg.spans;

        this._supportsScopes = true;
        this._hasCStack = true;

    }

    #loadAcmeReport(filename, project) {

        let src = null;

        try {
            src = fs.readFileSync(filename, "utf8");
        } catch (err) {
            if (err.code == 'ENOENT') {
                throw("label file " + filename + " does not exist");
            } else {
                throw("unable to read label file '" + filename + "'");
            }
        }

        let labelStatements = [];
        let baseDir = null;
        let source = null;
        let currentSourceRef = null;
        let insideMacro = false;

        const parser = new ReportParser(project);

        let lines = src.split("\n").filter(s => (s.trim().length > 0));
        for (let line of lines) {

            const statements = parser.parseLine(line);
            if (!statements) continue;

            for (const statement of statements) {
                if (!statement) continue;

                const statementType = statement.type;

                if (insideMacro) {
                    if (statementType == ReportStatementType.SCOPE_END) {
                        insideMacro = false;
                    }
                    continue;
                }

                switch (statementType) {

                    case ReportStatementType.MACRO_BEGIN: {
                        insideMacro = true;
                        break;
                    }

                    case ReportStatementType.SOURCE: {

                        source = statement.path;

                        if (project && !path.isAbsolute(source)) {
                            source = project.resolveFile(source);
                            if (!source && baseDir) {
                                source = path.resolve(baseDir, source);
                            }
                        } else {
                            source = path.resolve(source);
                        }

                        if (null == baseDir) {
                            baseDir = path.dirname(source);
                        }

                        const normalizedPath = this.#getRefName(source);
                        currentSourceRef = this.#getOrCreateLineList(normalizedPath);

                        break;
                    }
                    case ReportStatementType.LABEL: {
                        labelStatements.push(statement);
                        break;

                    }
                    case ReportStatementType.ADDRESS: {

                        const addressInfo = new DebugAddressInfo(
                            statement.value,
                            statement.value,
                            source,
                            statement.line
                        );

                        addressInfo.globalRef = this._addresses.length;
                        this._addresses.push(addressInfo);

                        for (let addr = addressInfo.address; addr <= addressInfo.address_end; addr++) {
                            this._addressMap[addr] = addressInfo;
                        }

                        if (null != currentSourceRef) {
                            addressInfo.localRef = currentSourceRef.length;
                            addressInfo.localRefTable = currentSourceRef;
                            currentSourceRef.push(addressInfo);
                        }

                        if (statement.symbol) {
                            const debugSymbol = new DebugSymbol(
                                statement.symbol,
                                statement.value,
                                true,
                                source,
                                statement.line,
                                statement.data_size
                            );
                            this.storeSymbol(debugSymbol);
                            if (addressInfo) addressInfo.addDebugSymbol(debugSymbol);
                        }

                        for (let label of labelStatements) {
                            label.address = statement.value;
                            const debugLabel = new DebugLabel(
                                label.name,
                                label.address,
                                source,
                                label.line
                            );
                            this.storeLabel(debugLabel);
                            if (addressInfo) addressInfo.addDebugLabel(debugLabel);
                        }

                        labelStatements = [];
                        break;

                    }
                    case ReportStatementType.SYMBOL: {

                        this.storeSymbol(new DebugSymbol(
                            statement.name,
                            statement.value,
                            statement.isAddress,
                            source,
                            statement.line,
                            statement.data_size
                        ));

                        break;
                    }
                    default: {
                        break;
                    }
                }
            }
        }
    }

    #resolve() {
        // executed after debug info has been loaded
    }

    storeLabel(label) {
        if (!this._labels) this._labels = new Map();
        this._labels.set(label.name, label);
    }

    storeSymbol(symbol) {
        if (!this._symbols) this._symbols = new Map();
        this._symbols.set(symbol.name, symbol);
    }

    #getRefName(filename) {
        return Utils.normalizePath(filename);
    }

    getSymbol(name) {
        let elements = this._symbols;
        if (!elements) return null;
        return elements.get(name);
    }

    getLabel(name) {
        let elements = this._labels;
        if (!elements) return null;
        return elements.get(name);
    }

    getAddressInfo(addr) {
        if (addr < 0 || addr >= this._addressMap.length) {
            return null;
        }
        return this._addressMap[addr];
    }

    getScopes(addr) {
        if (!this.supportsScopes) return null;

        const addrInfo = this.getAddressInfo(addr);
        if (!addrInfo) return null;

        const span = addrInfo.span;
        if (!span) return null;

        const spans = this._spans;
        let spanIdx = spans.indexOf(span);
        if (spanIdx < 0) return null;

        while (spanIdx >= 0) {
            const s = spans.get(spanIdx);
            if (s.scopeInfos) {
                return s.scopeInfos; // just grab first
            }
            spanIdx--;
        }

        return null;
    }

    getScopeName(addr) {
        if (!this.supportsScopes) return null;

        const scopes = this.getScopes(addr);
        if (!scopes) return null;

        for (const scope of scopes) {
            if (!scope.csymInfos) continue;
            for (const csymInfo of scope.csymInfos) {
                if (csymInfo.sc == "ext" && csymInfo.type == 0) {
                    return csymInfo.name;
                }
            }
        }

        return null;
    }

    getScopedSymbol(addr, symbolName) {
        if (!this.supportsScopes) return null;

        const scopes = this.getScopes(addr);
        if (!scopes) return null;

        let symbol = null;

        for (const scope of scopes) {
            if (!scope.csymInfos) continue;

            for (const csymInfo of scope.csymInfos) {
                if (csymInfo.sc != "auto" || csymInfo.type != 0) continue;
                if (csymInfo.name == symbolName) {
                    const relativeAddress = csymInfo.offs ? parseInt(csymInfo.offs) : 0;
                    symbol = new DebugSymbol(symbolName, relativeAddress, true);
                    break;
                }
            }

        }

        return symbol;
    }

    findNextLine(addr) {
        const addressInfo = this.getAddressInfo(addr);
        if (!addressInfo) return null;

        const moduleRef = addressInfo.localRef;
        const moduleTable = addressInfo.localRefTable;
        if (!moduleTable || null == moduleRef || moduleRef >= moduleTable.length-1) {
            return null;
        }

        return moduleTable[moduleRef+1];
    }

    findNearestCodeLine(filename, line) {
        const normalizedPath = this.#getRefName(filename);

        const lineListByFile = this._lineListByFile;
        if (!lineListByFile) return null;

        const lineList = this._lineListByFile.get(normalizedPath);
        if (!lineList) return null;

        const pos = lineList.indexOf(line);
        if (pos < 0) return null;

        const foundAddr = lineList.get(pos);

        return foundAddr;
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    DebugInfo: DebugInfo,
    DebugAddressInfo: DebugAddressInfo,
    ReportElementType: ReportElementType,
    DebugParser: Cc65DebugParser,
    KickAssemblerInfo: KickAssemblerInfo
}
