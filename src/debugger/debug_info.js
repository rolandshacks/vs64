//
// Debug Info
//

const path = require('path');
const fs = require('fs');
const { Utils, SortedArray } = require('../utilities/utils');
const { values } = require('../emulator/roms/kernal');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

//-----------------------------------------------------------------------------------------------//
// Types and Constants
//-----------------------------------------------------------------------------------------------//

const OPCODES =
    "adc,and,asl,bcc,bcs,beq,bit,bmi,bne,bpl,brk,bvc,bvs,clc,cld,cli,clv,cmp,cpx,cpy,dec,dex,"+
    "dey,eor,inc,inx,iny,jmp,jsr,lda,ldx,ldy,lsr,nop,ora,pha,php,pla,plp,rol,ror,rti,rts,sbc,"+
    "sec,sed,sei,sta,stx,sty,tax,tay,tsx,txa,txs,tya,";

//-----------------------------------------------------------------------------------------------//
// CC65 Debug Info Parser
//-----------------------------------------------------------------------------------------------//

const DebugTypes = {
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

const DebugCSymbolTypes = {
    FUNC:           0,
    VAR:            1
};

const DebugCSymbolStorageTypes = {
    AUTO:           0,      // "auto" = STACK
    REGISTER:       1,
    STATIC:         2,
    EXTERN:         3
};

const DebugScopeTypes = {
    GLOBAL:         0,
    MODULE:         1,
    SCOPE:          2,
    STRUCT:         3,
    ENUM:           4
};

const DebugSymbolTypes = {
    EQUATE:         0,
    LABEL:          1,
    IMPORT:         2
};

class DebugParser {

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
                const decodedValue = DebugParser.decode(k, rawValue);
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

        const lineType = lineInfo.type || DebugLineTypes.ASM;

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
            const statement = DebugParser.parseLine(line);
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
                    DebugParser.addScopeToSpan(span, scope);
                }
            } else {
                const span = data.spans[scope.span];
                DebugParser.addScopeToSpan(span, scope);
                scope.spanInfo = span;
            }
        }

        for (const csym of data.csyms) {
            if (csym.scope == null) continue;
            const scope = data.scopes[csym.scope];
            if (scope) {
                DebugParser.addCSymToScope(csym, scope);
            }
        }

        for (const line of data.lines) {
            if (line.span == null) continue;

            if (Array.isArray(line.span)) {
                for (const spanId of line.span) {
                    const span = data.spans[spanId];
                    DebugParser.addLineToSpan(span, line);
                }
            } else {
                const span = data.spans[line.span];
                DebugParser.addLineToSpan(span, line);
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

                const addrInfo = new DebugAddressInfo(addr, addrEnd, file.name, line);

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

        const data = DebugParser.scan(src);
        const dbg = DebugParser.resolve(project, data);

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

    static scan(line) {
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
                        source = path.normalize(line.substr(j+7).trim());
                        if (source.charAt(1) == ':') {
                            source = source.substr(0, 1).toUpperCase() + source.substr(1);
                        }
                    } else {
                        comment = line.substr(i+1);
                    }
                    break;
                }

                if ("=,".indexOf(line[i]) >= 0) {
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
                        tokens.push(line.substr(pos1, pos2-pos1));
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

    static lex(tokens) {
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

                    let num = ReportParser.parseNumber(token);

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
                            element = { type: ReportElementType.ADDRESS, value: ReportParser.parseNumber(token, true), desc: "address" };
                        } else if ( 3 == i && isCodeLine) {
                            element = { type: ReportElementType.DATA, value: token, desc: "data" };
                        } else if ( 4 == i && isCodeLine && ReportParser.isValidSymbol(token)) {
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

    static parseLine(line) {

        const parseResult = ReportParser.scan(line);
        if (!parseResult) return null;

        const tokens = parseResult.tokens;
        const elements = ReportParser.lex(tokens);

        let statement = null;

        if (null != parseResult.source) {

            statement = {
                type: ReportStatementType.SOURCE,
                path: parseResult.source,
                desc: "source"
            };

        } else if (elements.length == 2 && elements[1].type == ReportElementType.UNKNOWN) {

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

            const num = ReportParser.parseNumber(elements[3].value);
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

            const num = ReportParser.parseNumber(elements[4].value);
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

            const num = ReportParser.parseNumber(elements[4].value);
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

            const num = ReportParser.parseNumber(elements[1].value, true);
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
        }

        return statement;
    }

    static isValidSymbol(token) {
        if (token.charAt(0) != '.' && token.charAt(0) != '_') {
            let ch = token.charAt(0).toLowerCase();
            if (ch < 'a' || ch > 'z' || (token.length == 3 && OPCODES.indexOf(token.toLowerCase()) >= 0)) {
                return false;
            }
        }
        return true;
    }

    static parseNumber(s, hex) {

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
    constructor(name, value, isAddress, source, line, data_size) {
        this.name = name;
        this.value = value;
        this.isAddress = isAddress;
        this.source = source;
        this.line = line;
        this.data_size = data_size||0;
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

class DebugFileInfo {
    constructor(name, size, type) {
        this.name = name;
        this.size = size;
        this.type = type || DebugLineTypes.ASM;
    }
}

class DebugAddressInfo {
    constructor(address, address_end, source, line) {
        this.address = address;
        this.address_end = address_end;
        this.source = path.resolve(path.normalize(source));
        this.normalizedPath = Utils.normalizePath(source);
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

        // using array instead of map for
        // real constant time access
        // (whereas hashing might be a problem)
        this._addressMap = new Array(0x1000);

        this.#load(filename, project);
    }

    get supportsScopes() {
        return (this._supportsScopes == true);
    }

    get hasCStack() {
        return (this._hasCStack == true);
    }

    #load(filename, project) {
        const debugInfoType = path.extname(filename).toLowerCase();
        if (debugInfoType == ".report") {
            this.#loadReport(filename, project);
        } else if (debugInfoType == ".dbg") {
            this.#loadDebug(filename, project);
        } else if (debugInfoType == ".elf") {
            this.#loadElf(filename, project);
        }

        this.#resolve();
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

    #loadElf(filename, project) {
        // NOT IMPLEMENTED
    }

    #loadDebug(filename, project) {

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

        const dbg = DebugParser.parse(project, src);

        const addressInfos = dbg.addressInfos;

        for (const addressInfo of addressInfos) {

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

    #loadReport(filename, project) {

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
        let lastLabel = null;

        let lines = src.split("\n").filter(s => (s.trim().length > 0));
        for (let line of lines) {

            const statement = ReportParser.parseLine(line);
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

                    lastLabel = null;
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

        const memStart = span.address;
        const memEnd = memStart + span.size;

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
        const lineList = this._lineListByFile.get(normalizedPath);
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
    ReportParser: ReportParser,
    ReportElementType: ReportElementType,
    DebugParser: DebugParser
}
