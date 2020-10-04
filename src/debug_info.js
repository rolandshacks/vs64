//
// Debug Info
//

const path = require('path');
const fs = require('fs');
const process = require('process');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
var Constants = require('src/constants');
var Utils = require('src/utils');

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
    DATA: 15
};

const StatementType = {
    LABEL: 1,
    SYMBOL: 2,
    ADDRESS: 3
};

const OPCODES =
    "adc,and,asl,bcc,bcs,beq,bit,bmi,bne,bpl,brk,bvc,bvs,clc,cld,cli,clv,cmp,cpx,cpy,dec,dex,"+
    "dey,eor,inc,inx,iny,jmp,jsr,lda,ldx,ldy,lsr,nop,ora,pha,php,pla,plp,rol,ror,rti,rts,sbc,"+
    "sec,sed,sei,sta,stx,sty,tax,tay,tsx,txa,txs,tya,";

//-----------------------------------------------------------------------------------------------//
// Debug Info
//-----------------------------------------------------------------------------------------------//
class DebugInfo {

    static load(filename) {

        var absFilename = path.resolve(filename);
        var src = null;

        try {
            src = fs.readFileSync(filename, "utf8");
        } catch (err) {
            if (err.code == 'ENOENT') {
                throw("label file " + filename + " does not exist");
            } else {
                throw("unable to read label file '" + filename + "'");
            }
        }

        var lines = src.split("\n").filter(s => (s.trim().length > 0));

        var labelStatements = [];

        var baseDir = null;

        var debugInfo = {
            labels: [],
            symbols: [],
            addresses: [],
            statements: [],
            sourceRef: []
        };

        var source = null;
        var addressRefs = null;

        for (var i=0, line; (line=lines[i]); i++) {

            var statement = DebugInfo.parseReport(line);
            if (null != statement) {
                if (statement.type == StatementType.SOURCE) {

                    source = statement.path;

                    if (null == baseDir) {
                        baseDir = path.dirname(source);
                    } else if (!path.isAbsolute(source)) {
                        source = path.resolve(baseDir, source);
                    }

                    addressRefs = debugInfo.sourceRef[source];
                    if (null == addressRefs) {
                        addressRefs = [];
                        debugInfo.sourceRef[source] = addressRefs;
                    }

                    continue;

                } else if (statement.type == StatementType.LABEL) {

                    labelStatements.push(statement);

                } else if (statement.type == StatementType.ADDRESS) {

                    var addressInfo = {
                        address: statement.value,
                        source: source,
                        line: statement.line
                    };

                    debugInfo.addresses.push(addressInfo);

                    if (null != addressRefs) {
                        addressRefs.push(addressInfo);
                    }

                    if (statement.symbol) {
                        debugInfo.symbols.push({
                            name: statement.symbol,
                            value: statement.value,
                            isAddress: true,
                            source: source,
                            line: statement.line,
                            data_size: statement.data_size
                        });
                    }

                    for (var j=0, label; (label=labelStatements[j]); j++) {
                        label.address = statement.value;
                        debugInfo.labels.push({
                            name: label.name,
                            address: label.address,
                            source: source,
                            line: label.line
                        });
                    }

                    labelStatements = [];

                } else if (statement.type == StatementType.SYMBOL) {

                    debugInfo.symbols.push({
                        name: statement.name,
                        value: statement.value,
                        isAddress: statement.isAddress,
                        source: source,
                        line: statement.line
                    });

                }

                if (null != source) {
                    statement.source = source; // add source code reference
                }

                debugInfo.statements.push(statement);
            }
        }

        if (debugInfo.statements.length > 0) {
            return debugInfo;
        }

        return null;
    }

    static parseReport(line) {

        var tokens = [];
        var comment = null;
        var source = null;

        {
            let i=0;

            while (i<line.length) {

                while (i<line.length && " \t\r\n".indexOf(line[i])>=0) { i++; }

                if (line[i] == ';') {

                    var j = line.indexOf("Source:", i+1);
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
                    var pos1 = i;
                    while (i<line.length && " \t\r\n,=;:".indexOf(line[i])<0) { i++; }

                    // break after '...' in long code line to find label
                    //    22  081b c4554d4220455841....string  !pet "Dumb example", 13, 0
                    if (tokens.length == 2) {
                        var posDots = line.indexOf('...',pos1);
                        if (posDots > 0 && posDots < i) {
                            i = posDots + 3;
                        }
                    }

                    var pos2 = i;
                    if (pos2>pos1) {
                        tokens.push(line.substr(pos1, pos2-pos1));
                    }
                }
            }
        }

        //var tokenDump = tokens.join("|"); console.log(tokenDump);

        var elements = [];
        var lastElementType = 0;
        var isCodeLine = false;

        {
            let i=0;

            while (i<tokens.length) {

                var token = tokens[i++];
                var element = null;

                if (token == '*') {
                    element = { type: ElementType.ASTERISK, desc: "asterisk" };
                } else if (token == '=') {
                    element = { type: ElementType.EQUALS, desc: "equals" };
                } else if (token == ',') {
                    element = { type: ElementType.COMMA, desc: "comma" };
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

                    var num = DebugInfo.parseNumber(token);

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
                            element = { type: ElementType.ADDRESS, value: DebugInfo.parseNumber(token, true), desc: "address" };
                        } else if ( 3 == i && isCodeLine) {
                            element = { type: ElementType.DATA, value: token, desc: "data" };
                        } else if ( 4 == i && isCodeLine && DebugInfo.isValidSymbol(token)) {
                            element = { type: ElementType.SYMBOL, name: token, desc: "symbol" };
                        } else {
                            element = { type: ElementType.UNKNOWN, value: token, desc: "unknown" };
                        }

                    }
                }

                if (null != element) {
                    element.token = token;
                    elements.push(element);
                    lastElementType = element.type;
                } else {
                    lastElementType = 0;
                }
            }
        }

        var statement = null;

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
            elements[1].type == ElementType.UNKNOWN &&
            elements[2].type == ElementType.EQUALS &&
            elements[3].type == ElementType.UNKNOWN) {

            let num = DebugInfo.parseNumber(elements[3].value);
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

            let num = DebugInfo.parseNumber(elements[4].value);
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

            let num = DebugInfo.parseNumber(elements[1].value, true);
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

        if (null != statement) {
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

        var value = 0;
        var hexValue = 0;

        var isHex = hex;
        var isNegative = false;

        var i = 0;

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

            var digit = 0;

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

        var result = (isHex ? hexValue : value);
        if (isNegative) result = -result;

        return result;
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = DebugInfo;
