//
// Basic Language
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { BasicKeywords, BasicV2Keywords } = require('settings/settings');
const { Range, ParserBase, TokenType, Token, StatementType, Statement, ParserHelper, ParserIterator, CharCode } = require('language/language_base');

//-----------------------------------------------------------------------------------------------//
// BASIC Grammar
//-----------------------------------------------------------------------------------------------//

const BasicGrammar = {

    basicKeywords: BasicKeywords,
    basicKeywordSet: new Set(BasicKeywords),
    basicKeywordAbbreviationSet: (() => {

        const abbrSet = new Set();

        // just handle Basic V2 keyword abbreviations
        for (const word of BasicV2Keywords) {
            if (word.length >= 2) {
                const abbr = word[0].toLowerCase() + word[1].toUpperCase();
                abbrSet.add(abbr);
            }
        }

        return abbrSet;

    })(),

    fuzzySearch: function(query) {

        if (!query || query.length < 1) return null;

        const items = [];

        const queryUpper = query.toUpperCase();

        for (let keyword of BasicGrammar.basicKeywords) {
            if (keyword.startsWith(queryUpper)) {
                items.push(keyword);
            }
        }

        if (items.length < 1) return null;

        return items;
    },

    isKeyword: function(s) {
        if (null == s || s.length < 2 || s.length > 7) return false;

        if (s.length <= 3 && BasicGrammar.basicKeywordAbbreviationSet.has(s)) {
            return true;
        }

        const su = s.toUpperCase();
        return BasicGrammar.basicKeywordSet.has(su);
    },

    matchKeyword: function(s) {
        if (null == s || s.length < 2) return null;

        if (s.length >= 3 && BasicGrammar.basicKeywordAbbreviationSet.has(s.substring(0, 3))) return s.substring(0, 3);
        if (s.length >= 2 && BasicGrammar.basicKeywordAbbreviationSet.has(s.substring(0, 2))) return s.substring(0, 2);

        const su = s.toUpperCase();
        if (BasicGrammar.basicKeywordSet.has(su)) return su;

        for (const word of BasicGrammar.basicKeywords) {
            if (su.startsWith(word)) {
                return word;
            }
        }

        return null;
    }

};

//-----------------------------------------------------------------------------------------------//
// Basic Parser
//-----------------------------------------------------------------------------------------------//

class BasicParser extends ParserBase {
    constructor() {
        super();
        this._variableSet = new Set();
    }

    getTokenAtSourcePos(source, offset, leftOnly, greedyParsing) {

        if (leftOnly || greedyParsing) {
            return super.getTokenAtSourcePos(source, offset ,leftOnly, greedyParsing);
        }

        this.parse(source);

        const ast = this._ast;
        if (null == ast || null == ast.tokens) return null;

        let foundToken = null;

        const tokens = ast.tokens;
        for (const token of tokens) {
            const range = token.range;
            if (range.isInside(offset)) {
                foundToken = token
                break;
            }
        }

        if (null == foundToken) return null;

        const str = foundToken.text;

        return str;
    }

    parse(src, filename, options) {
        if (null == src || src.length < 1) return;
        super.parse(src, filename, options);

        this._variableSet.clear();

        const cancellationToken = options ? options.cancellationToken : null;
        const ast = this._ast;
        const len = src.length;
        const it = new ParserIterator(src);

        let tokensPerLineOfs = -1;
        let tokensPerLineCount = 0;
        let beginningOfLine = true;
        let lastWasJump = false;

        while (!it.eof()) {

            if (cancellationToken && cancellationToken.isCancellationRequested) return;

            const c = it.peek();

            let tokens = [];

            if (ParserHelper.isAlpha(c)) { // identifier
                let range = new Range(it.ofs, it.row, it.col);
                let id = "";

                const startOfs = it.clone();

                // scan whole identifier
                while (it.ofs < len && ParserHelper.isAlpha(src.charCodeAt(it.ofs))) {
                    id += src[it.ofs];
                    range.inc(); it.next();
                }

                let wasLabel = false;

                if (it.ofs < len) {
                    if ("$%#".indexOf(src[it.ofs]) >= 0) {
                        id += src[it.ofs];
                        range.inc(); it.next();
                    } else if (beginningOfLine && src[it.ofs] == ':') {
                        wasLabel = true;
                    }
                }

                let foundKeyword = null;

                if (!lastWasJump && !wasLabel) {
                    // no keyword can be after a goto or gosub
                    foundKeyword = BasicGrammar.matchKeyword(id);
                    if (foundKeyword) {
                        it.set(startOfs);
                        range = new Range(it.ofs, it.row, it.col);
                        it.next(foundKeyword.length);
                        range.inc(foundKeyword.length);

                        if (foundKeyword == "GOTO" || foundKeyword == "GOSUB") {
                            lastWasJump = true;
                        }
                    }
                }

                const identifier = range.substringFrom(src).toLowerCase();
                if (identifier == "rem") {
                    while (it.ofs < len && src.charCodeAt(it.ofs) != CharCode.CarriageReturn && src.charCodeAt(it.ofs) != CharCode.LineFeed) {
                        range.inc(); it.next();
                    }
                    tokens.push(new Token(TokenType.Comment, src, range));
                } else {
                    if (wasLabel) {
                        tokens.push(new Token(TokenType.Label, src, range));
                    } else {
                        tokens.push(new Token(foundKeyword ? TokenType.Keyword : TokenType.Identifier, src, range));
                    }
                }

            } else if (CharCode.Equals == c) { // assignment
                const range = new Range(it.ofs, it.row, it.col);
                range.inc(); it.next();
                tokens.push(new Token(TokenType.Operator, src, range));

            } else if (c == CharCode.CarriageReturn || c == CharCode.LineFeed) { // line break
                const range = new Range(it.ofs, it.row, it.col);
                const c2 = (it.ofs+1 < len) ? src.charCodeAt(it.ofs+1) : 0;
                if (c == CharCode.CarriageReturn && c2 == CharCode.LineFeed) {
                    range.inc(); it.next(); // skip another char
                }
                it.nextline();
                tokens.push(new Token(TokenType.LineBreak, src, range));
                lastWasJump = false;
            } else if (c == CharCode.Colon) { // statement separator
                const range = new Range(it.ofs, it.row, it.col);
                range.inc(); it.next();
                tokens.push(new Token(TokenType.LineBreak, src, range));
                lastWasJump = false;
            } else if (c == CharCode.NumberSign) { // line comment
                const range = new Range(it.ofs, it.row, it.col);
                range.inc(); it.next();
                while (it.ofs < len && ParserHelper.isSymbolChar(src.charCodeAt(it.ofs))) {
                    range.inc(); it.next();
                }

                const command = range.substringFrom(src).toLowerCase();
                if (command == "#include") {
                    tokens.push(new Token(TokenType.Macro, src, range));
                } else {
                    while (it.ofs < len && src.charCodeAt(it.ofs) != CharCode.CarriageReturn && src.charCodeAt(it.ofs) != CharCode.LineFeed) {
                        range.inc(); it.next();
                    }
                    tokens.push(new Token(TokenType.Comment, src, range));
                }

            } else if (c == CharCode.DoubleQuote) { // string
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

            } else if (ParserHelper.isNumeric(src.charCodeAt(it.ofs) || src.charCodeAt(it.ofs) == CharCode.Period)) {

                const range = new Range(it.ofs, it.row, it.col);
                range.inc(); it.next();

                while (it.ofs < len && (ParserHelper.isNumeric(src.charCodeAt(it.ofs)) || src.charCodeAt(it.ofs) == CharCode.Period)) {
                    range.inc(); it.next();
                }

                tokens.push(new Token(beginningOfLine ? TokenType.LineNumber : TokenType.Number, src, range));

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
                        beginningOfLine = true;
                    } else {
                        if (tokensPerLineOfs == -1) tokensPerLineOfs = ast.tokens.length - 1;
                        tokensPerLineCount++;
                        beginningOfLine = false;
                    }
                }
            }

        }

        if (tokensPerLineCount > 0) {
            this.lexer(tokensPerLineOfs, tokensPerLineCount);
        }

    }

    lexer(tokenOffset, tokenCount) {
        if (tokenCount < 1) return;

        let ofs = tokenOffset;
        let count = tokenCount;

        const ast = this._ast;
        const tokens = ast.tokens;
        if (!tokens || tokens.length < ofs + count) return;

        while (count > 0) {

            let statement = null;
            let consumed = 1;

            let token = tokens[ofs];
            let tokenText = token.text;
            let tokenType = token.type;

            if (tokenType == TokenType.LineNumber) { // BASIC line
                statement = new Statement(StatementType.Definition, StatementType.LabelDefinition, token, tokens, ofs, 1);

            } else if (tokenType == TokenType.Keyword) {
                const keyword = tokenText.toUpperCase();

                if (count > 1 && keyword == "DIM") {
                    // handle DIM statement
                    const paramToken = tokens[ofs+1];
                    if (paramToken.type == TokenType.Identifier && !this._variableSet.has(paramToken.text)) {
                        if (!this._variableSet.has(paramToken.text)) {
                            this._variableSet.add(paramToken.text);
                            statement = new Statement(StatementType.Definition, StatementType.VariableDefinition, paramToken, tokens, ofs, 2);
                        }
                    }
                    consumed = 2;
                } else if (count > 1 && (keyword == "GOTO" || keyword == "GOSUB" || keyword == "GO" || keyword == "GO")) {
                    // skip/handle GOTO/GOSUB label
                    // statement = new Statement(StatementType.Definition, StatementType.LabelDefinition, token, tokens, ofs, 1);
                    consumed = 2;
                }

            } else if (tokenType == TokenType.Identifier) {
                // handle auto-define at first usage / assignment
                if (!this._variableSet.has(tokenText)) {
                    this._variableSet.add(tokenText);

                    let defCount = 1;
                    if (count >= 3 && tokens[ofs+1].type == TokenType.Operator &&
                        (tokens[ofs+2].type == TokenType.Number ||tokens[ofs+2].type == TokenType.String)) {
                        defCount += 2;
                    }

                    statement = new Statement(StatementType.Definition, StatementType.VariableDefinition, token, tokens, ofs, defCount);
                }
            } else if (tokenType == TokenType.Label) { // label
                statement = new Statement(StatementType.Definition, StatementType.LabelDefinition, token, tokens, ofs, 1);
            } else if (tokenType == TokenType.Macro && count > 1) {
                const macroCommand = tokenText;
                const paramToken = tokens[ofs+1];

                if (macroCommand == "#include" && paramToken.type == TokenType.String) {
                    statement = new Statement(StatementType.Include, null, paramToken, tokens, ofs, 2);
                }

            }

            if (statement) {
                ast.addStatement(statement);
                if (statement.type == StatementType.Definition) {
                    ast.addDefinition(statement);
                } else if (statement.type == StatementType.Include) {
                    ast.addReference(statement);
                }
                statement = null;
            }

            ofs+=consumed;
            count-=consumed;

        }
    }


};

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    BasicParser: BasicParser,
    BasicGrammar: BasicGrammar
}
