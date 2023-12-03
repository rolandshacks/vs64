//
// Language Server
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Vscode Module
//-----------------------------------------------------------------------------------------------//
const path = require('path');
const fs = require('fs');

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { FileCache } = require('utilities/cache');
const { TokenType, StatementType } = require('language/language_base');
const { AsmParser, AsmGrammar } = require('language/language_asm');
const { BasicParser, BasicGrammar } = require('language/language_basic');

//-----------------------------------------------------------------------------------------------//
// LanguageServer
//-----------------------------------------------------------------------------------------------//

class LanguageServer {
    constructor() {
        this._parserCache = new FileCache(
            (filename, options) => {
                return Parser.parse(null, filename, options);
            },
            (filename, options) => {
                let key = filename;
                if (options && options.toolkit) key += ":toolkit=" + options.toolkit.name;
                if (options && options.languageId) key += ":lang=" + options.languageId;
                return key;
            });

    }

    getAstFromFile(filename, options) {
        const ast = this._parserCache.get(filename, options);
        return ast;
    }

    getAstFromDocument(document, options) {
        const text = document.getText();
        if (null == text) return null;
        const ast = Parser.parse(text, null, options);
        return ast;
    }

    getTokenAtDocumentPos(document, position, leftOnly, greedyParsing) {
        const parser = Parser.fromType(document.languageId);
        if (!parser) return null;

        if (!document || !position) return null;

        const textLine = document.lineAt(position.line);
        if (!textLine ||textLine.isEmptyOrWhitespace) return null;

        const source = textLine.text;
        const offset = position.character-1;

        return parser._impl.getTokenAtSourcePos(source, offset, leftOnly, greedyParsing);
    }

    fuzzySearch(languageId, identifier) {
        // used for code completion
        if (languageId == "bas") {
            return BasicGrammar.fuzzySearch(identifier);
        }
        return AsmGrammar.fuzzySearch(identifier);
    }

    getSources(recursiveSearch, project) {
        if (!project.isValid()) return null;

        let srcFiles = null;

        if (project.toolkit.isBasic) {
            srcFiles = project.getBasicSourceFiles(recursiveSearch);
        } else {
            srcFiles = project.getAsmSourceFiles(recursiveSearch);
        }

        return srcFiles;

    }

}

//-----------------------------------------------------------------------------------------------//
// Parser
//-----------------------------------------------------------------------------------------------//

class Parser {
    constructor(impl) {
        this._impl = impl;
    }

    static fromType(typeName) {
        let impl = null;
        if (typeName == "asm") {
            impl = new AsmParser();
        } else if (typeName == "bas") {
            impl = new BasicParser();
        }
        if (!impl) return null;
        const instance = new Parser(impl);
        return instance;
    }

    static fromFile(filename) {
        const extName = path.extname(filename).toLowerCase();
        const typeName = (extName == ".bas") ? "bas" : "asm";
        return Parser.fromType(typeName);
    }

    static parse(source, filename, options) {
        let parser = null;
        if (filename && source == null) {
            try {
                source = fs.readFileSync(filename, "utf8");
            } catch (err) {
                return null;
            }
            parser = Parser.fromFile(filename);
        } else if (options && options.languageId) {
            parser = Parser.fromType(options.languageId);
        }
        if (!parser) return null;
        parser._impl.parse(source, filename, options);

        const cancellationToken = options ? options.cancellationToken : null;
        if (cancellationToken && cancellationToken.isCancellationRequested) return null;
        return parser._impl.ast;
    }


}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Parser: Parser,
    LanguageServer: LanguageServer
}
