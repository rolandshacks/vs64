//
// Language types
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { AssemblerOpcodes, BasicKeywords } = require('settings/settings');

//-----------------------------------------------------------------------------------------------//
// Character Codes
//-----------------------------------------------------------------------------------------------//

const CharCode = {
    A: 'A'.charCodeAt(0),
    F: 'F'.charCodeAt(0),
    Z: 'Z'.charCodeAt(0),
    a: 'a'.charCodeAt(0),
    f: 'f'.charCodeAt(0),
    z: 'z'.charCodeAt(0),
    _0: '0'.charCodeAt(0),
    _1: '1'.charCodeAt(1),
    _9: '9'.charCodeAt(0),
    Semicolon: ';'.charCodeAt(0),
    LineFeed: '\n'.charCodeAt(0),
    CarriageReturn: '\r'.charCodeAt(0),
    Tabulator: '\t'.charCodeAt(0),
    Period: '.'.charCodeAt(0),
    SingleQuote: '\''.charCodeAt(0),
    DoubleQuote: '\"'.charCodeAt(0),
    Underscore: '_'.charCodeAt(0),
    Colon: ':'.charCodeAt(0),
    NumberSign: '#'.charCodeAt(0),
    Exclamation: '!'.charCodeAt(0),
    Space: ' '.charCodeAt(0),
    Plus: '+'.charCodeAt(0),
    Minus: '-'.charCodeAt(0),
    Slash: '/'.charCodeAt(0),
    Backslash: '\\'.charCodeAt(0),
    Asterisk: '*'.charCodeAt(0),
    Equals: '='.charCodeAt(0),
    LessThan: '<'.charCodeAt(0),
    GreaterThan: '>'.charCodeAt(0),
    Dollar: '$'.charCodeAt(0),
    Percent: '%'.charCodeAt(0),
    BracketLeft: '('.charCodeAt(0),
    BracketRight: ')'.charCodeAt(0)
};

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
    Preprocessor: 9,
    Expression: 10,
    Keyword: 11,
    Label: 12,
    LineNumber: 13
};

//-----------------------------------------------------------------------------------------------//
// Statement Type
//-----------------------------------------------------------------------------------------------//

const StatementType = {
    Unknown: 0,
    Comment: 1,
    Definition: 2,
    Include: 3,

    MacroDefinition: 100,
    ConstantDefinition: 101,
    AddressDefinition: 102,
    LabelDefinition: 103,
    FunctionDefinition: 104,
    VariableDefinition: 105
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
        if (type == TokenType.Expression) return "expression";
        if (type == TokenType.Keyword) return "keyword";
        if (type == TokenType.LineNumber) return "linenumber";

        return "unknown";
    }

    isAssemblerOpcode() {
        if (this._range.length != 3) return false;
        const identifier = this.text;
        return (AssemblerOpcodes.indexOf(identifier.toUpperCase()) != -1);
    }

    isBasicOpcode() {
        if (this._range.length < 2) return false;
        const identifier = this.text;
        if (BasicKeywords.indexOf(identifier.toUpperCase()) != -1) return true;
        return false;
    }
}

//-----------------------------------------------------------------------------------------------//
// Statement
//-----------------------------------------------------------------------------------------------//

class Statement {
    constructor(type, subtype, textToken, tokens, ofs, count) {
        this._type = type;
        this._subtype = subtype;
        this._tokens = tokens;
        this._tokenOffset = ofs;
        this._tokenCount = count;
        this._textToken = textToken;
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
    get subtype() { return this._subtype; }
    get tokenOffset() { return this._tokenOffset; }
    get tokenCount() { return this._tokenCount; }
    get range() { return this._range; }
    get text() { return this._textToken.text; }

    getToken(idx) { return this._tokens[this._tokenOffset + idx]; }


    getTokensAsString(ofs, len) {
        ofs ||= 0;
        len ||= this.tokenCount - ofs;

        const startToken = this._tokens[this._tokenOffset + ofs];
        const endToken = this._tokens[this._tokenOffset + ofs + len - 1]

        const startOfs = startToken.range.offset;
        const endOfs = endToken.range.offset + endToken.range.length;

        const s =  this._src.substring(startOfs, endOfs);

        return s;
    }

    getTypeName() {
        const type = this._type;

        if (type == StatementType.Comment) return "Comment";
        if (type == StatementType.Definition) return "Definition";
        if (type == StatementType.Include) return "Include";
        if (type == StatementType.MacroDefinition) return "MacroDefinition";
        if (type == StatementType.ConstantDefinition) return "ConstantDefinition";
        if (type == StatementType.AddressDefinition) return "AddressDefinition";
        if (type == StatementType.LabelDefinition) return "LabelDefinition";
        if (type == StatementType.FunctionDefinition) return "FunctionDefinition";
        if (type == StatementType.VariableDefinition) return "VariableDefinition";

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

    clone() {
        return new Range(this._offset ,this._row, this._col, this._length);
    }

    set(range) {
        this._offset = range._offset;
        this._row = range._row;
        this._col = range._col;
        this._length = range._length;
    }

    inc(count) {
        this._length += (count || 1);
    }

    isInside(offset) {
        return (offset >= this._offset && offset < this._offset + this._length);
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
// AbstractSyntaxTreeElement
//-----------------------------------------------------------------------------------------------//

class AbstractSyntaxTreeElement {
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
        this._references = null;
    }

    get tokens() { return this._tokens; }
    get statements() { return this._statements; }
    get definitions() { return this._definitions; }
    get references() { return this._references; }

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

        const definition = new AbstractSyntaxTreeElement(statement);
        const text = definition.text;

        this._definitions.set(text, definition);
    }

    addReference(statement) {
        if (!this._references) this._references = [];

        const reference = new AbstractSyntaxTreeElement(statement);
        this._references.push(reference);
    }

    getReferences() {
        return this._references;
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
        this._options = null;
    }

    get ast() { return this._ast; }

    get isKickAss() {
        return (this._options && this._options.toolkit && this._options.toolkit.isKick);
    }

    get isAcme() {
        return (this._options && this._options.toolkit && this._options.toolkit.isAcme);
    }

    get isLLVM() {
        return (this._options && this._options.toolkit && this._options.toolkit.isLLVM);
    }

    get isBasic() {
        return (this._options && this._options.toolkit && this._options.toolkit.isBasic);
    }

    parse(src, filename, options) {
        this._options = options;
        this._ast = new AbstractSyntaxTree(filename);
    }

    getTokenAtSourcePos(source, offset, leftOnly, greedyParsing) {

        let startPos = offset;
        while (startPos > 0) {
            const c = source.charCodeAt(startPos-1);
            if (greedyParsing) {
                if (ParserHelper.isWhitespace(c)) break;
            } else {
                if (c != CharCode.Period && c != CharCode.Exclamation && !ParserHelper.isSymbolChar(c)) break;
            }
            startPos--;
            if (c == CharCode.Period || c == CharCode.Exclamation) {
                break; // just accept single '.' or '!' as prefix to label
            }
        }

        let endPos = offset + 1;

        if (!leftOnly) {
            while (endPos < source.length) {
                const c = source.charCodeAt(endPos);
                if (!ParserHelper.isSymbolChar(c)) break;
                endPos++;
            }
        }

        const token = source.substring(startPos, endPos).trim();
        if (token.length < 1) return null;

        return token;
    }
};

//-----------------------------------------------------------------------------------------------//
// ParserHelper
//-----------------------------------------------------------------------------------------------//

class ParserHelper {

    static isNumeric(c) {
        return (c >= CharCode._0 && c <= CharCode._9); // 0-9
    }

    static isNumericHex(c) {
        return ((c >= CharCode._0 && c <= CharCode._9) ||
                (c >= CharCode.A && c <= CharCode.F) ||
                (c >= CharCode.a && c <= CharCode.f)); // 0-9 and a-f
    }

    static isNumericBin(c) {
        return (c == CharCode._0 || c == CharCode._1);
    }

    static isAlpha(c) {
        return ((c >= CharCode.A && c <= CharCode.Z) || (c >= CharCode.a && c <= CharCode.z)); // A-Z | a-z
    }

    static isAlphaNumeric(c) {
        return ParserHelper.isNumeric(c) || ParserHelper.isAlpha(c);
    }

    static isSymbolChar(c) {
        return (ParserHelper.isAlphaNumeric(c) || c == CharCode.Underscore);
    }

    static isWhitespace(c) {
        return (c == CharCode.Space || c == CharCode.Tabulator || c == CharCode.LineFeed || c == CharCode.CarriageReturn);
    }

}

//-----------------------------------------------------------------------------------------------//
// Parser Iterator
//-----------------------------------------------------------------------------------------------//

class ParserIterator {
    constructor(src, ofs, row, col) {
        this.src = src;
        this.len = src.length;
        this.ofs = ofs||0;
        this.row = row||0;
        this.col = col||0;
    }

    clone() {
        return new ParserIterator(this.src, this.ofs, this.row, this.col);
    }

    set(it) {
        this.src = it.src;
        this.len = it.len;
        this.ofs = it.ofs;
        this.row = it.row;
        this.col = it.col;
    }

    eof() {
        return (this.ofs >= this.len);
    }

    peek() {
        if (this.eof()) return 0;
        return this.src.charCodeAt(this.ofs);
    }

    peekString(len) {
        if (this.eof()) return "";
        if (null == len) return this.src.substring(this.ofs);
        if (len < 1) return "";
        const numChars = Math.min(len, this.len - this.ofs);
        if (numChars < 1) return "";
        return this.src.substring(this.ofs, this.ofs + numChars);
    }

    continuesWith(str) {
        if (null == str || str.length < 1 || this.eof()) return false;
        return this.src.startsWith(str, this.ofs);
    }

    next(delta) {
        delta ||= 1;
        this.ofs += delta;
        this.col += delta;
    }

    nextline() {
        this.ofs++;
        this.row++;
        this.col = 0;
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Range: Range,
    ParserBase: ParserBase,
    CharCode: CharCode,
    ParserHelper: ParserHelper,
    ParserIterator: ParserIterator,
    AbstractSyntaxTreeElement: AbstractSyntaxTreeElement,
    AbstractSyntaxTree: AbstractSyntaxTree,
    TokenType: TokenType,
    Token: Token,
    StatementType: StatementType,
    Statement: Statement
}
