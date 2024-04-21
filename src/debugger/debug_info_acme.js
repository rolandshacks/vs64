//
// Debug Info - Oscar64
//

const path = require('path');
const fs = require('fs');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { Utils } = require('utilities/utils');
const { DebugSymbol, DebugAddressInfo, DebugLabel, DebugOpcodes } = require('debugger/debug_info_types');

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

class AcmeDebugInfo {
    static load(debug_info, project, filename) {

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

        const parser = new AcmeDebugParser(project);

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

                        const normalizedPath = debug_info.getRefName(source);
                        currentSourceRef = debug_info.getOrCreateLineList(normalizedPath);

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

                        addressInfo.globalRef = debug_info._addresses.length;
                        debug_info._addresses.push(addressInfo);

                        for (let addr = addressInfo.address; addr <= addressInfo.address_end; addr++) {
                            debug_info._addressMap[addr] = addressInfo;
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
                            debug_info.storeSymbol(debugSymbol);
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
                            debug_info.storeLabel(debugLabel);
                            if (addressInfo) addressInfo.addDebugLabel(debugLabel);
                        }

                        labelStatements = [];
                        break;

                    }
                    case ReportStatementType.SYMBOL: {

                        debug_info.storeSymbol(new DebugSymbol(
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
}

class AcmeDebugParser {

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
                    element = { type: ReportElementType.DATA_SIZE, value: 1, desc: "data-size" };
                } else if (token == '!byte') {
                    element = { type: ReportElementType.DATA_SIZE, value: 1, desc: "data-size" };
                } else if (token == '!08') {
                    element = { type: ReportElementType.DATA_SIZE, value: 1, desc: "data-size" };
                } else if (token == '!word') {
                    element = { type: ReportElementType.DATA_SIZE, value: 2, desc: "data-size" };
                } else if (token == '!16') {
                    element = { type: ReportElementType.DATA_SIZE, value: 2, desc: "data-size" };
                } else if (token == '!24') {
                    element = { type: ReportElementType.DATA_SIZE, value: 3, desc: "data-size" };
                } else if (token == '!32') {
                    element = { type: ReportElementType.DATA_SIZE, value: 4, desc: "data-size" };
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
                    data_size: 1,
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
            if (ch < 'a' || ch > 'z' || (token.length == 3 && DebugOpcodes.indexOf(token.toLowerCase()) >= 0)) {
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
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    AcmeDebugInfo: AcmeDebugInfo
}
