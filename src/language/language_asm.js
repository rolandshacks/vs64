//
// Assembler Language
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { ParserHelper, CharCode } = require('utilities/utils');
const { Range, ParserBase, TokenType, Token, StatementType, Statement } = require('language/language_base');

//-----------------------------------------------------------------------------------------------//
// ACME Grammar
//-----------------------------------------------------------------------------------------------//

const AsmGrammar = {
    acmePseudoOpcodes: [
        "fill", "fi", "align", "convtab", "ct", "text", "tx", "pet", "raw", "scr", "scrxor", "to",
        "source", "src","binary", "bin", "zone", "zn", "sl", "svl", "sal", "pdb", "if", "ifdef",
        "for", "do", "endoffile", "warn", "error", "serious", "macro", "set", "initmem", "pseudopc",
        "cpu", "al", "as", "rl", "rs", "cbm", "subzone", "sz", "realpc", "previouscontext", "byte",
        "by", "word", "wo"
    ],

    kickAssemblerDirectives: [
        "align", "assert", "asserterror", "break", "by", "byte", "const", "cpu", "define", "disk",
        "dw", "dword", "encoding", "enum", "error", "errorif", "eval", "file", "filemodify",
        "filenamespace", "fill", "fillword", "for", "function", "if", "import", "importonce",
        "label", "lohifill", "macro", "memblock", "modify", "namespace", "pc", "plugin", "print",
        "printnow", "pseudocommand", "pseudopc", "return", "segment", "segmentdef", "segmentout",
        "struct", "te", "text", "var", "while", "wo", "word", "zp"
    ],

    kickPreprocessorDirectives: [
        "define", "elif", "else", "endif", "if", "import", "importif", "importonce", "undef"
    ],

    fuzzySearch: function(query) {

        if (!query || query.length < 1) return null;

        const items = [];

        if (query.charCodeAt(0) == CharCode.Exclamation) {
            for (let item of AsmGrammar.acmePseudoOpcodes) {
                const token = "!" + item;
                if (token.startsWith(query)) {
                    items.push(token);
                }
            }
        } else if  (query.charCodeAt(0) == CharCode.Period) {
            for (let item of AsmGrammar.kickAssemblerDirectives) {
                const token = "." + item;
                if (token.startsWith(query)) {
                    items.push(token);
                }
            }
        } else if  (query.charCodeAt(0) == CharCode.NumberSign) {
            for (let item of AsmGrammar.kickPreprocessorDirectives) {
                const token = "#" + item;
                if (token.startsWith(query)) {
                    items.push(token);
                }
            }
        }

        if (items.length < 1) return null;

        return items;
    }

};

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

    eof() {
        return (this.ofs >= this.len);
    }

    peek() {
        if (this.eof()) return 0;
        return this.src.charCodeAt(this.ofs);
    }

    next() {
        this.ofs++;
        this.col++;
    }

    nextline() {
        this.ofs++;
        this.row++;
        this.col = 0;
    }

}


//-----------------------------------------------------------------------------------------------//
// Assembler Parser
//-----------------------------------------------------------------------------------------------//

class AsmParser extends ParserBase {
    constructor() {
        super();
    }

    parse(src, filename, options) {
        super.parse(src, filename, options);

        const ast = this._ast;

        const len = src.length;

        const it = new ParserIterator(src);

        let isKickAss = false;
        let isAcme = false;

        if (options && options.toolkit) {
            isKickAss = options.toolkit.isKick;
            isAcme = options.toolkit.isAcme;
        }

        let tokensPerLineOfs = -1;
        let tokensPerLineCount = 0;

        while (!it.eof()) {

            const c = it.peek();
            const c2 = (it.ofs+1 < len) ? src.charCodeAt(it.ofs+1) : 0;

            let tokens = [];

            if (c == CharCode.CarriageReturn || c == CharCode.LineFeed) { // line break

                const range = new Range(it.ofs, it.row, it.col);

                const c2 = (it.ofs+1 < len) ? src.charCodeAt(it.ofs+1) : 0;
                if (c == CharCode.CarriageReturn && c2 == CharCode.LineFeed) {
                    range.inc(); it.next(); // skip another char
                }
                it.nextline();

                tokens.push(new Token(TokenType.LineBreak, src, range));

            } else if (c == CharCode.Asterisk && c2 == CharCode.Equals) { // *=PC

                const range = new Range(it.ofs, it.row, it.col);

                while (it.ofs < len && src.charCodeAt(it.ofs) != CharCode.CarriageReturn && src.charCodeAt(it.ofs) != CharCode.LineFeed) {
                    range.inc(); it.next();
                }

                tokens.push(new Token(TokenType.Comment, src, range));

            } else if (c == CharCode.Semicolon || (c == CharCode.Slash && c2 == CharCode.Slash)) { // line comment

                const range = new Range(it.ofs, it.row, it.col);

                while (it.ofs < len && src.charCodeAt(it.ofs) != CharCode.CarriageReturn && src.charCodeAt(it.ofs) != CharCode.LineFeed) {
                    range.inc(); it.next();
                }

                tokens.push(new Token(TokenType.Comment, src, range));

            } else if (c == CharCode.NumberSign && (c2 == CharCode.LessThan || c2 == CharCode.GreaterThan)) { // #< or #>
                it.next(); // skip #< or #>
                it.next();
            } else if (c == CharCode.NumberSign && isKickAss) { // preprocessor

                const range = new Range(it.ofs, it.row, it.col);

                while (it.ofs < len && src.charCodeAt(it.ofs) != CharCode.CarriageReturn && src.charCodeAt(it.ofs) != CharCode.LineFeed) {
                    range.inc(); it.next();
                }

                tokens.push(new Token(TokenType.Preprocessor, src, range));

            } else if (c == CharCode.Plus && c2 == CharCode.Plus) { // ++ label
                it.next(); // skip ++
                it.next();
            } else if (
                (c == CharCode.Period && isAcme) ||
                (c == CharCode.Exclamation && isKickAss) ||
                c == CharCode.Underscore ||
                ParserHelper.isAlpha(c) ||
                (c == CharCode.Plus && ParserHelper.isSymbolChar(c2))) { // identifier

                let range = null;

                let isReference = false;
                let isKickReference = false;

                if (c == CharCode.Plus && ParserHelper.isSymbolChar(c2)) {
                    if (tokensPerLineCount == 0) {
                        // '+macro' expression
                        isReference = true;
                        const prefixRange = new Range(it.ofs, it.row, it.col);
                        prefixRange.inc(); it.next();
                        tokens.push(new Token(TokenType.Reference, src, prefixRange));
                    } else {
                        // just a '+' operator in front of identifier
                        it.next();
                    }
                } else if (isKickAss && c == CharCode.Exclamation && ParserHelper.isSymbolChar(c2)) {
                    if (tokensPerLineCount > 0) {
                        // !label reference
                        isReference = true;
                        isKickReference = true;
                        const prefixRange = new Range(it.ofs, it.row, it.col);
                        prefixRange.inc();
                        tokens.push(new Token(TokenType.Reference, src, prefixRange));
                    }
                }

                range = new Range(it.ofs, it.row, it.col);
                if (!isReference || isKickReference) {
                    range.inc(); it.next();
                }

                while (it.ofs < len && ParserHelper.isSymbolChar(src.charCodeAt(it.ofs))) {
                    range.inc(); it.next();
                }

                tokens.push(new Token(TokenType.Identifier, src, range));

            } else if (
                (c == CharCode.Exclamation && isAcme) ||
                (c == CharCode.Period && isKickAss)) { // directive or macro

                const range = new Range(it.ofs, it.row, it.col);
                range.inc(); it.next();

                while (it.ofs < len && ParserHelper.isSymbolChar(src.charCodeAt(it.ofs))) {
                    range.inc(); it.next();
                }

                tokens.push(new Token(TokenType.Macro, src, range));

            } else if (c == CharCode.SingleQuote || c == CharCode.DoubleQuote) { // string
                const quoteChar = c;

                it.next(); // skip opening quote char

                const range = new Range(it.ofs, it.row, it.col);

                while (it.ofs < len && src.charCodeAt(it.ofs) != quoteChar) {
                    range.inc(); it.next();
                }

                if (it.ofs < len) {
                    it.next(); // skip closing quote char
                }

                tokens.push(new Token(TokenType.String, src, range));

            } else {
                it.next();
            }

            if (tokens.length > 0) {

                for (const token of tokens) {
                    ast.addToken(token);
                    if (tokensPerLineCount == 0) token.setFirstFlag();

                    if (token.type == TokenType.LineBreak || token.type == TokenType.Comment) {
                        if (tokensPerLineCount > 0) {
                            this.lexer(tokensPerLineOfs, tokensPerLineCount);
                            tokensPerLineOfs = -1;
                            tokensPerLineCount = 0;
                        }
                    } else {
                        if (tokensPerLineOfs == -1) tokensPerLineOfs = ast.tokens.length - 1;
                        tokensPerLineCount++;
                    }
                }
            }

        }

        if (tokensPerLineCount > 0) {
            this.lexer(tokensPerLineOfs, tokensPerLineCount);
        }

    }

    lexer(tokenOffset, tokenCount) {
        if (tokenCount < 1) return null;

        const ofs = tokenOffset;
        const count = tokenCount;

        const ast = this._ast;
        const tokens = ast.tokens;
        if (!tokens || tokens.length < ofs + count) return null;

        let statement = null;

        const token = tokens[ofs];
        const tokenType = token.type;

        if (tokenType == TokenType.Identifier) {
            if (!token.isOpcode()) {
                statement = new Statement(StatementType.Definition, tokens, ofs, 1);
            }
        } else if (tokenType == TokenType.Comment) {
            statement = new Statement(StatementType.Comment, tokens, ofs, 1);
        } else if (count > 1) {
            const token2 = tokens[ofs+1];
            const macroCommand = token.text;
            if (tokenType == TokenType.Macro
                && (macroCommand == "!macro" || macroCommand == "!set" || macroCommand == "!addr")
                && token2.type == TokenType.Identifier) {
                if (!token2.isOpcode()) {
                    statement = new Statement(StatementType.Definition, tokens, ofs+1, 1);
                }
            }
        }

        if (statement) {
            ast.addStatement(statement);
            if (statement.type == StatementType.Definition) {
                ast.addDefinition(statement);
            }
        }
    }

    getTokenAtDocumentPos(document, position, leftOnly, greedyParsing) {
        if (!document || !position) return null;

        const textLine = document.lineAt(position.line);
        if (!textLine ||textLine.isEmptyOrWhitespace) return null;

        const source = textLine.text;
        const offset = position.character;

        return this.getTokenAtSourcePos(source, offset, leftOnly, greedyParsing);
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
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    AsmParser: AsmParser,
    AsmGrammar: AsmGrammar
}
