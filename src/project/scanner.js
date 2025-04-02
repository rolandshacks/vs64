//
// Scanner
//

const fs = require('fs');
const path = require("path");

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { Logger } = require('utilities/logger');

const logger = new Logger("Scanner");

//-----------------------------------------------------------------------------------------------//
// Scanner
//-----------------------------------------------------------------------------------------------//

const WHITESPACE_CHARS = " \t\r\n\v";

function isWhitespace(c) {
    return (WHITESPACE_CHARS.indexOf(c) >= 0);
}

const TokenType = {
    None: 0,
    Include: 1
};

const TokenValueType = {
    None: 0,
    Filename: 1
};

const TokenDescriptors = {
    "!src": { tokenType: TokenType.Include,valueType: TokenValueType.Filename },
    "!source": { tokenType: TokenType.Include,valueType: TokenValueType.Filename },
    "#include": { tokenType: TokenType.Include,valueType: TokenValueType.Filename },
    "#import": { tokenType: TokenType.Include,valueType: TokenValueType.Filename }
};

class Token {
    constructor(descriptor, value, lineNumber) {
        this._descriptor = descriptor;
        this._type = descriptor.tokenType;
        this._valueType = descriptor.valueType;
        this._value = this.parseValue(value);
        this._lineNumber = lineNumber;
    }

    parseValue(value) {
        return value;
    }

    get descriptor() { return this._descriptor; }
    get type() { return this._type; }
    get value() { return this._value; }
    get line() { return this._lineNumber; }
}

class Scanner {

    static scan(filename, referenceList, project) {

        if (!referenceList) {
            referenceList = [];
        }

        logger.debug("scanFile: " + filename);

        const dirname = path.dirname(filename);

        let source = null;

        try {
            source = fs.readFileSync(filename, 'utf8');
        } catch(_err) {
            return referenceList;
        }

        const tokens = Scanner.#parse(source, filename);

        if (tokens) {
            for (const token of tokens) {
                if (token.type == TokenType.Include) {
                    const ref = project.resolveFile(token.value, dirname);
                    if (ref) {
                        if (referenceList.indexOf(ref) == -1) {
                            referenceList.push(ref);
                            Scanner.scan(ref, referenceList, project);
                        }
                    }
                }
            }
        }

        return referenceList;
    }

    static #parse(source, _filename_) {

        if (!source) return null;

        let lineNumber = 0;
        let _colNumber_ = 0;

        let pos = 0;
        let endpos = source.length;

        let line = "";

        let tokens = [];

        while (pos < endpos) {

            const c = source[pos];
            pos++;

            if (c == '\r' || c == '\n' || pos == endpos) {
                if (c == '\r' && pos < endpos) {
                    if (source[pos] == '\n') pos++;
                }

                const token = Scanner.#parseLine(line, lineNumber);
                if (token) {
                    tokens.push(token);
                }

                line = "";
                lineNumber++;
                _colNumber_ = 0;
                continue;
            }

            line += c;
            _colNumber_++;

        }

        return tokens;

    }

    static #parseLine(source, lineNumber) {
        if (!source || source.length < 1) return null;

        let pos = 0;
        let endpos = source.length;

        while (pos < endpos && isWhitespace(source[pos])) { pos++; }

        if (pos == endpos) return null;

        const firstChar = source[pos];

        // just scan for special tokens
        if (firstChar != '!' && firstChar != '#') return null;

        if (source.startsWith("!if", pos)) {
            pos += 3;
            while (pos < endpos && source[pos] != '!') {
                pos++;
            }

            if (pos == endpos) return null;
        }

        let token = null;

        for (const tokenName of Object.keys(TokenDescriptors)) {
            const tokenDescriptor = TokenDescriptors[tokenName];

            if (source.startsWith(tokenName, pos)) {
                pos += tokenName.length;

                while (pos < endpos && isWhitespace(source[pos])) { pos++; }
                if (pos == endpos) break;

                const startChar = source.charAt(pos);
                if (startChar != '\"' && startChar != '\'' && startChar != '<') break;

                pos++;
                const startPos = pos;

                let escaped = false;
                while (pos < endpos) {
                    const c = source.charAt(pos);
                    if (escaped) {
                        escaped = false;
                    } else {
                        if (c == '>') {
                            if (startChar == '<') break;
                        } else if (c == startChar) {
                            break;
                        } else if (c == '\\') {
                            escaped = true;
                        }
                    }
                    pos++;
                }

                let value = source.substring(startPos, pos).trim();

                if (value.length > 0) {
                    token = new Token(tokenDescriptor, value, lineNumber);
                }

                break;
            }
        }

        return token;
    }

}


//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Scanner: Scanner
}
