//
// ASM/ACME Language
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
const { Utils, ParserHelper, CharCode } = require('utilities/utils');
const { Constants, Opcodes } = require('settings/settings');
const { Definition, Location, Range, ParserBase, DefinitionProvider, AbstractSyntaxTree, TokenType, Token, StatementType, Statement } = require('language/language_base');

const logger = new Logger("AsmLanguage");

//-----------------------------------------------------------------------------------------------//
// ACME Parser
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

class AcmeParser extends ParserBase {
    constructor() {
        super();
    }

    parse(src, filename) {
        super.parse(src, filename);

        const ast = this._ast;

        const len = src.length;

        const it = new ParserIterator(src);

        let tokensPerLineOfs = -1;
        let tokensPerLineCount = 0;

        while (!it.eof()) {

            const c = it.peek();
            let token = null;

            if (c == CharCode.CarriageReturn || c == CharCode.LineFeed) {

                const range = new Range(it.ofs, it.row, it.col);

                const c2 = (it.ofs+1 < len) ? src.charCodeAt(it.ofs+1) : 0;
                if (c == CharCode.CarriageReturn && c2 == CharCode.LineFeed) {
                    range.inc(); it.next(); // skip another char
                }
                it.nextline();

                token = new Token(TokenType.LineBreak, src, range);

            } else if (c == CharCode.Semicolon) {

                const range = new Range(it.ofs, it.row, it.col);

                while (it.ofs < len && src.charCodeAt(it.ofs) != CharCode.CarriageReturn && src.charCodeAt(it.ofs) != CharCode.LineFeed) {
                    range.inc(); it.next();
                }

                token = new Token(TokenType.Comment, src, range);

            } else if (c == CharCode.Period || c == CharCode.Underscore || ParserHelper.isAlpha(c)) {

                const range = new Range(it.ofs, it.row, it.col);
                range.inc(); it.next();

                while (it.ofs < len && ParserHelper.isSymbolChar(src.charCodeAt(it.ofs))) {
                    range.inc(); it.next();
                }

                token = new Token(TokenType.Identifier, src, range);

            } else if (c == CharCode.Exclamation) {

                const range = new Range(it.ofs, it.row, it.col);
                range.inc(); it.next();

                while (it.ofs < len && ParserHelper.isSymbolChar(src.charCodeAt(it.ofs))) {
                    range.inc(); it.next();
                }

                token = new Token(TokenType.Macro, src, range);

            } else if (c == CharCode.SingleQuote || c == CharCode.DoubleQuote) {
                const quoteChar = c;

                it.next(); // skip opening quote char

                const range = new Range(it.ofs, it.row, it.col);

                while (it.ofs < len && src.charCodeAt(it.ofs) != quoteChar) {
                    range.inc(); it.next();
                }

                if (it.ofs < len) {
                    it.next(); // skip closing quote char
                }

                token = new Token(TokenType.String, src, range);

            } else {
                it.next();
            }

            if (token) {
                
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

        if (count == 1) {
            if (tokenType == TokenType.Identifier) {
                if (!token.isOpcode()) {
                    statement = new Statement(StatementType.Definition, tokens, ofs, count);
                }
            } else if (tokenType == TokenType.Comment) {
                statement = new Statement(StatementType.Comment, tokens, ofs, 1);
            }
        } else {
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

    getTokenAtDocumentPos(document, position) {
        if (!document || !position) return null;

        const textLine = document.lineAt(position.line);
        if (!textLine ||textLine.isEmptyOrWhitespace) return null;

        const source = textLine.text;
        const offset = position.character;

        return this.getTokenAtSourcePos(source, offset);
    }

    getTokenAtSourcePos(source, offset) {

        let startPos = offset;
        while (startPos > 0) {
            const c = source.charCodeAt(startPos-1);
            if (c != CharCode.Period && !ParserHelper.isSymbolChar(c)) break;
            startPos--;
            if (c == '.') break; // just accept single '.' as prefix to label
        }

        let endPos = offset + 1;
        while (endPos < source.length) {
            const c = source.charCodeAt(endPos);
            if (!ParserHelper.isSymbolChar(c)) break;
            endPos++;
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
    AcmeParser: AcmeParser
}
