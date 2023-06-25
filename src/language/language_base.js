//
// Language types
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
const { Logger } = require('utilities/logger');
const { Utils } = require('utilities/utils');
const { Constants, Opcodes } = require('settings/settings');

const logger = new Logger("Parser");

//-----------------------------------------------------------------------------------------------//
// Token Type
//-----------------------------------------------------------------------------------------------//

const TokenType = {
    Unknown: 0,
    Comment: 1,
    Identifier: 2,
    Operator: 3,
    String: 4,
    Number: 5,
    LineBreak: 6,
    Macro: 7,
    Reference: 8,
    Preprocessor: 9
};

//-----------------------------------------------------------------------------------------------//
// Statement Type
//-----------------------------------------------------------------------------------------------//

const StatementType = {
    Unknown: 0,
    Comment: 1,
    Definition: 2
};

//-----------------------------------------------------------------------------------------------//
// Token
//-----------------------------------------------------------------------------------------------//

class Token {
    constructor(type, src, range) {
        this._type = type;
        this._src = src;
        this._range = range;
        this._first = null;
        this._declaration = null;
    }

    get type() { return this._type; }
    get range() { return this._range; }
    get text() { return this._range.substringFrom(this._src); }

    setFirstFlag() {
        this._first = true;
    }

    isFirst() { return (this._first == true); }

    setDeclarationFlag() {
        this._declaration = true;
    }

    isDeclaration() { return (this._declaration == true); }

    getTypeName() {
        const type = this._type;

        if (type == TokenType.LineBreak) return "linebreak";
        if (type == TokenType.Comment) return "comment";
        if (type == TokenType.Identifier) return "identifier";
        if (type == TokenType.Operator) return "operator";
        if (type == TokenType.String) return "string";
        if (type == TokenType.Number) return "number";
        if (type == TokenType.Macro) return "macro";
        if (type == TokenType.Reference) return "reference";
        if (type == TokenType.Preprocessor) return "preprocessor";

        return "unknown";
    }

    isOpcode() {
        if (this._range.length != 3) return false;
        const identifier = this.text;
        return (Opcodes.indexOf(identifier.toUpperCase()) != -1);
    }
}

//-----------------------------------------------------------------------------------------------//
// Statement
//-----------------------------------------------------------------------------------------------//

class Statement {
    constructor(type, tokens, ofs, count) {
        this._type = type;
        this._tokens = tokens;
        this._tokenOffset = ofs;
        this._tokenCount = count;
        if (tokens && tokens.length > 0) {
            const startToken = tokens[ofs];
            const endToken = tokens[ofs + count - 1];
            this._src = startToken._src;
            this._range = Range.join(startToken.range, endToken.range);
        } else {
            this._src = null;
            this._range = new Range(0, 0, 0);
        }
    }

    get type() { return this._type; }
    get tokenOffset() { return this._tokenOffset; }
    get tokenCount() { return this._tokenCount; }
    get range() { return this._range; }
    get text() { return this._range.substringFrom(this._src); }
    get length() { return this._tokenCount; }

    getToken(idx) { return this._tokens[this._tokenOffset + idx]; }

    getTypeName() {
        const type = this._type;

        if (type == StatementType.Comment) return "comment";
        if (type == StatementType.Definition) return "definition";

        return "unknown";
    }
}

//-----------------------------------------------------------------------------------------------//
// Range
//-----------------------------------------------------------------------------------------------//

class Range {
    constructor(offset, row, col, length) {
        this._offset = offset;
        this._row = row;
        this._col = col;
        this._length = length||0;
    }

    get offset() { return this._offset; }
    get row() { return this._row; }
    get col() { return this._col; }
    get length() { return this._length; }

    inc(count) {
        this._length += (count || 1);
    }

    substringFrom(str) {
        if (!str) return null;
        return str.substring(this._offset, this._offset + this._length);
    }

    static join(r1, r2) {

        let begin = r1.offset < r2. offset ? r1 : r2;
        let end = r1.offset < r2. offset ? r2 : r1;

        return new Range(
            begin.offset,
            begin.row,
            begin.col,
            end.offset + end.length - begin.offset
        );
    }
}

//-----------------------------------------------------------------------------------------------//
// Define
//-----------------------------------------------------------------------------------------------//

class Definition {
    constructor(statement) {
        this._statement = statement;
    }

    get statement() { return this._statement; }
    get text() { return this._statement.text; }
    get range() { return this._statement.range; }
}

//-----------------------------------------------------------------------------------------------//
// Abstract Syntax Tree
//-----------------------------------------------------------------------------------------------//
class AbstractSyntaxTree {
    constructor(filename) {
        this._filename = filename;
        this._tokens = null;
        this._statements = null;
        this._definitions = null;
    }

    get tokens() { return this._tokens; }
    get statements() { return this._statements; }
    get definitions() { return this._definitions; }

    dump() {

        const statements = this._statements;
        if (!statements) return;

        for (const statement of statements) {
            console.log("statement: " + statement.getTypeName());

            const tokens = statement.tokens;
            if (!tokens) continue;

            let s = "";
            for (let i=0; i<statement.length; i++) {
                const token = statement.getToken(i);
                if (s.length > 0) s += " ";
                s += token.getTypeName() + "(" + token.text + ")";
            }
            if (s.length > 0) console.log(s);
        }

    }

    addToken(token) {
        if (!this._tokens) this._tokens = [];
        this._tokens.push(token);
    }

    addStatement(statement) {
        if (!this._statements) this._statements = [];
        this._statements.push(statement);
    }

    addDefinition(statement) {
        if (!this._definitions) this._definitions = new Map();

        const definition = new Definition(statement);
        const text = definition.text;

        this._definitions.set(text, definition);
    }

    findDefinition(text) {
        if (!text || text.length < 1) return null;

        const definitions = this._definitions;
        if (!definitions) return null;

        const definition = definitions.get(text);

        return definition;
    }
};

//-----------------------------------------------------------------------------------------------//
// Parser Base
//-----------------------------------------------------------------------------------------------//

class ParserBase {
    constructor() {
        this._ast = null;
    }

    get ast() { return this._ast; }

    parseFile(filename, options) {
        let src = null;
        try {
            src = fs.readFileSync(filename, "utf8");
        } catch (err) {
            return null;
        }

        return this.parse(src, filename, options);
    }

    parse(src, filename, options) {
        if (!src || src.length < 1) return;
        this._ast = new AbstractSyntaxTree(filename);
    }
};

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Definition: Definition,
    Range: Range,
    ParserBase: ParserBase,
    AbstractSyntaxTree: AbstractSyntaxTree,
    TokenType: TokenType,
    Token: Token,
    StatementType: StatementType,
    Statement: Statement
}
