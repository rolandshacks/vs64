//
// Debug Info
//

const path = require('path');
const fs = require('fs');
const { Utils } = require('../utilities/utils');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

//-----------------------------------------------------------------------------------------------//
// Type
//-----------------------------------------------------------------------------------------------//
const ElementType = {
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
    MACRO: 18
};

const StatementType = {
    LABEL: 1,
    SYMBOL: 2,
    ADDRESS: 3,
    SCOPE_END: 4,
    MACRO_BEGIN: 5
};

const OPCODES =
    "adc,and,asl,bcc,bcs,beq,bit,bmi,bne,bpl,brk,bvc,bvs,clc,cld,cli,clv,cmp,cpx,cpy,dec,dex,"+
    "dey,eor,inc,inx,iny,jmp,jsr,lda,ldx,ldy,lsr,nop,ora,pha,php,pla,plp,rol,ror,rti,rts,sbc,"+
    "sec,sed,sei,sta,stx,sty,tax,tay,tsx,txa,txs,tya,";

class ReportParser {

    static parseLine(line) {

        let tokens = [];
        let comment = null;
        let source = null;

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

        let elements = [];
        let isCodeLine = false;

        {
            let i=0;

            while (i<tokens.length) {

                let token = tokens[i++];
                let element = null;

                if (token == '*') {
                    element = { type: ElementType.ASTERISK, desc: "asterisk" };
                } else if (token == '=') {
                    element = { type: ElementType.EQUALS, desc: "equals" };
                } else if (token == ',') {
                    element = { type: ElementType.COMMA, desc: "comma" };
                } else if (token == '{') {
                    element = { type: ElementType.SCOPE_BEGIN, desc: "scope-begin" };
                } else if (token == '}') {
                    element = { type: ElementType.SCOPE_END, desc: "scope-end" };
                } else if (token == '!macro') {
                    element = { type: ElementType.MACRO, desc: "macro" };
                } else if (token == '!addr') {
                    element = { type: ElementType.KEYWORD_ADDR, desc: "keyword-addr" };
                } else if (token == '!pet') {
                    element = { type: ElementType.DATA_SIZE, value: 8, desc: "data-size" };
                } else if (token == '!byte') {
                    element = { type: ElementType.DATA_SIZE, value: 8, desc: "data-size" };
                } else if (token == '!08') {
                    element = { type: ElementType.DATA_SIZE, value: 8, desc: "data-size" };
                } else if (token == '!word') {
                    element = { type: ElementType.DATA_SIZE, value: 16, desc: "data-size" };
                } else if (token == '!16') {
                    element = { type: ElementType.DATA_SIZE, value: 16, desc: "data-size" };
                } else if (token == '!24') {
                    element = { type: ElementType.DATA_SIZE, value: 24, desc: "data-size" };
                } else if (token == '!32') {
                    element = { type: ElementType.DATA_SIZE, value: 32, desc: "data-size" };
                } else {

                    let num = ReportParser.parseNumber(token);

                    if (1 == i) {
                        if (null == num) {
                            break; // invalid line or just comment
                        }

                        element = { type: ElementType.NUMBER, value: num, desc: "number" };
                    } else {

                        // Note: The check for i<tokens.length (for labels) and "=" (for symbols) will make
                        //  a hex letters only token like 'cafe' be detected as unknown instead of address
                        if (2 == i && null != num && i < tokens.length && tokens[i] != "=") {
                            isCodeLine = true;
                            element = { type: ElementType.ADDRESS, value: ReportParser.parseNumber(token, true), desc: "address" };
                        } else if ( 3 == i && isCodeLine) {
                            element = { type: ElementType.DATA, value: token, desc: "data" };
                        } else if ( 4 == i && isCodeLine && ReportParser.isValidSymbol(token)) {
                            element = { type: ElementType.SYMBOL, name: token, desc: "symbol" };
                        } else {
                            element = { type: ElementType.UNKNOWN, value: token, desc: "unknown" };
                        }

                    }
                }

                if (null != element) {
                    element.token = token;
                    elements.push(element);
                }
            }
        }

        let statement = null;

        if (null != source) {

            statement = {
                type: StatementType.SOURCE,
                path: source,
                desc: "source"
            };

        } else if (elements.length == 2 && elements[1].type == ElementType.UNKNOWN) {

            statement = {
                type: StatementType.LABEL,
                name: elements[1].value,
                line: elements[0].value,
                desc: "label"
            };

        } else if (elements.length >= 4 &&
            elements[1].type == ElementType.MACRO &&
            elements[elements.length-1].type == ElementType.SCOPE_BEGIN) {

            statement = {
                type: StatementType.MACRO_BEGIN,
                name: elements[2].value,
                desc: "macro"
            };

        } else if (elements.length >= 2 &&
            elements[1].type == ElementType.SCOPE_END) {

            statement = {
                type: StatementType.SCOPE_END,
                desc: "scope-end"
            };

        } else if (elements.length >= 4 &&
            elements[1].type == ElementType.UNKNOWN &&
            elements[2].type == ElementType.EQUALS &&
            elements[3].type == ElementType.UNKNOWN) {

            const num = ReportParser.parseNumber(elements[3].value);
            if (null != num) {

                statement = {
                    type: StatementType.SYMBOL,
                    name: elements[1].value,
                    value: num,
                    isAddress: (num >= 0x100),
                    line: elements[0].value,
                    desc: "symbol"
                };

            }

        } else if (elements.length >= 5 &&
            elements[1].type == ElementType.KEYWORD_ADDR &&
            elements[2].type == ElementType.UNKNOWN &&
            elements[3].type == ElementType.EQUALS &&
            elements[4].type == ElementType.UNKNOWN) {

            const num = ReportParser.parseNumber(elements[4].value);
            if (null != num) {
                statement = {
                    type: StatementType.SYMBOL,
                    name: elements[2].value,
                    value: num,
                    isAddress: true,
                    line: elements[0].value,
                    desc: "symbol"
                };
            }

        } else if (elements.length >= 2 &&
                   elements[1].type == ElementType.UNKNOWN) {

            const num = ReportParser.parseNumber(elements[1].value, true);
            if (null != num) {
                statement = {
                    type: StatementType.ADDRESS,
                    value: num,
                    line: elements[0].value,
                    desc: "address"
                };
            }

        } else if (elements.length >= 2 &&
            elements[1].type == ElementType.ADDRESS) {

            statement = {
                type: StatementType.ADDRESS,
                value: elements[1].value,
                line: elements[0].value,
                desc: "address"
            };

            if (elements[3] && elements[3].type == ElementType.SYMBOL) {
                statement.symbol = elements[3].name;

                if (elements[4] && elements[4].type == ElementType.DATA_SIZE) {
                    statement.data_size = elements[4].value;
                }
            }

        }

        if (statement) {
            statement.details = {
                raw: line,
                comment: comment,
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

class DebugAddressInfo {
    constructor(address, source, line) {
        this.address = address;
        this.source = source;
        this.line = line;
        this.globalRef = null;
        this.localRef = null;
        this.localRefTable = null;
        this.debugSymbols = null;
        this.debugLabels = null;
    }

    compare(address, line) {
        if (address != null) {
            if (this.address > address) return 1;
            else if (this.address < address) return -1;
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
        this._addresses = [];
        this._sourceRef = [];

        // using array instead of map for
        // real constant time access
        // (whereas hashing might be a problem)
        this._addressMap = new Array(0x1000);

        this.#load(filename, project);
    }

    #load(filename, project) {

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

        let lines = src.split("\n").filter(s => (s.trim().length > 0));
        for (let line of lines) {

            const statement = ReportParser.parseLine(line);
            if (!statement) continue;

            const statementType = statement.type;

            if (insideMacro) {
                if (statementType == StatementType.SCOPE_END) {
                    insideMacro = false;
                }
                continue;
            }

            switch (statementType) {

                case StatementType.MACRO_BEGIN: {
                    insideMacro = true;
                    break;
                }

                case StatementType.SOURCE: {

                    source = statement.path;

                    if (!path.isAbsolute(source)) {
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

                    currentSourceRef = this._sourceRef[normalizedPath];
                    if (null == currentSourceRef) {
                        currentSourceRef = [];
                        this._sourceRef[normalizedPath] = currentSourceRef;
                    }

                    break;
                }
                case StatementType.LABEL: {
                    labelStatements.push(statement);
                    break;

                }
                case StatementType.ADDRESS: {

                    const addressInfo = new DebugAddressInfo(
                        statement.value,
                        source,
                        statement.line
                    );

                    addressInfo.globalRef = this._addresses.length;
                    this._addresses.push(addressInfo);
                    this._addressMap[addressInfo.address] = addressInfo;

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
                case StatementType.SYMBOL: {

                    this.storeSymbol(new DebugSymbol(
                        statement.name,
                        statement.value,
                        statement.isAddress,
                        source,
                        statement.line
                    ));

                    break;
                }
                default: {
                    break;
                }
            }
        }
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

    #getSourceRefs(filename) {
        const normalizedPath = this.#getRefName(filename);
        return this._sourceRef[normalizedPath];
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

    #queryAddressInfo(table, address, line) {
        // perform binary search

        if (!table || table.length < 1) return null;

        let l = 0;
        let r = table.length-1;

        let foundAddressInfo = null;

        while (null == foundAddressInfo && l <= r) {
            const m = Math.floor((l+r)/2);
            const addressInfo = table[m];

            const cmp = addressInfo.compare(address, line);
            if (cmp > 0) {
                r = m - 1;
            } else if (cmp > 0) {
                l = m + 1;
            } else {
                foundAddressInfo = addressInfo;
                break;
            }
        }

        return foundAddressInfo;
    }

    getAddressInfo(addr) {
        if (addr < 0 || addr >= this._addressMap.length) {
            return null;
        }
        return this._addressMap[addr];
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

    findNearestCodeLine(_path, line) {

        let addr = this.#getSourceRefs(_path);
        if (null == addr || addr.length == 0) {
            addr = this._addresses;
        }

        if (null == addr || addr.length == 0) {
            return null;
        }

        let foundAddr = null;

        let firstLine = addr[0].line;
        let lastLine = addr[addr.length-1].line;

        if (line <= firstLine) {
            foundAddr = addr[0];
        } else if (line >= lastLine) {
            foundAddr = addr[addr.length-1];
        } else {

            // perform binary search

            let l = 0;
            let r = addr.length-1;

            while (null == foundAddr && l <= r) {
                let m = Math.floor((l+r)/2);
                let a = addr[m];

                //logger.info("OFS: " + ofs + " " + line + ":" + a.line);

                if (line == a.line) {
                    foundAddr = a;
                    break;
                } else if (line > a.line) {
                    l = m + 1;
                } else {
                    r = m - 1;
                }
            }

        }

        return foundAddr;
    }


    searchAddressInfo(address) {

        let addr = this._addresses;
        if (addr.length < 1) return null;

        if (address < addr[0].address ||
            address > addr[addr.length-1].addr) {
            return null;
        }

        // perform binary search

        let foundAddr = null;
        let l = 0;
        let r = addr.length-1;

        while (null == foundAddr && l <= r) {
            let m = Math.floor((l+r)/2);
            let a = addr[m];

            //logger.info("OFS: " + ofs + " " + line + ":" + a.line);

            if (address == a.address) {
                foundAddr = a;
                break;
            } else if (address > a.address) {
                l = m + 1;
            } else {
                r = m - 1;
            }
        }

        return foundAddr;
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    DebugInfo: DebugInfo,
    DebugAddressInfo: DebugAddressInfo
}
