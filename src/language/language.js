//
// Language Features
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Vscode Module
//-----------------------------------------------------------------------------------------------//
const vscode = require('vscode');

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { TokenType } = require('language/language_base');
const { AsmParser, AsmGrammar } = require('language/language_asm');

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
        }
        if (!impl) return null;
        const instance = new Parser(impl);
        return instance;
    }

    static parseFile(filename, options) {
        const parser = Parser.fromType("asm");
        if (!parser) return null;
        parser._impl.parseFile(filename, options);
        return parser._impl.ast;
    }

    static parse(source, filename, options) {
        const parser = Parser.fromType("asm");
        if (!parser) return null;
        parser._impl.parse(source, filename, options);
        return parser._impl.ast;
    }

    static getTokenAtDocumentPos(document, position, leftOnly, greedyParsing) {
        const parser = Parser.fromType("asm");
        if (!parser) return null;
        return parser._impl.getTokenAtDocumentPos(document, position, leftOnly, greedyParsing);
    }

}

//-----------------------------------------------------------------------------------------------//
// DefinitionProvider
//-----------------------------------------------------------------------------------------------//

class LanguageFeatureProvider {
    constructor(project) {
        this._project = project;
    }

    // CompletionProvider

    async provideCompletionItems(document, position, _cancellationToken_) {
        const identifier = Parser.getTokenAtDocumentPos(document, position, true, true);
        if (!identifier) return null;

        const completedItems = AsmGrammar.fuzzySearch(identifier);
        if (!completedItems || completedItems.length < 1) return null;

        const startPosition = new vscode.Position(position.line, position.character - identifier.length);

        const items = [];

        for (const item of completedItems) {
            const completionItem = new vscode.CompletionItem(item);
            completionItem.kind = vscode.CompletionItemKind.Keyword;
            completionItem.range = new vscode.Range(startPosition, position);
            items.push(completionItem);
        }

        return items;
    }

    // DefinitionProvider

    provideDefinition(document, position, cancellationToken) {
        const identifier = Parser.getTokenAtDocumentPos(document, position);
        if (!identifier) return null;
        return this.findDefinitionLocation(identifier, cancellationToken);
    }

    findDefinitionLocation(identifier, cancellationToken) {

        if (!identifier || identifier.length < 1) return null;

        const project = this._project;
        if (!project.isValid()) return null;

        const sources = project.getAsmSourceFiles();
        if (!sources) return null;

        const locations = [];

        const options = {
            toolkit: project.toolkit
        };

        for (const filename of sources) {

            if (cancellationToken && cancellationToken.isCancellationRequested) return null;

            const ast = Parser.parseFile(filename, options);
            if (!ast) continue;

            const definition = ast.findDefinition(identifier);
            if (!definition) continue;

            const range = definition.range;

            locations.push({
                range: {
                    start: { line: range.row, character: range.col },
                    end: { line: range.row, character: range.col + range.length },
                    isEmpty: false,
                    isSingleLine: true
                },
                uri: vscode.Uri.file(filename)
            });

        }

        if (locations.length < 1) return null;

        return locations;
    }

    // Reference Provider

    provideReferences(document, position, context, cancellationToken) {
        const identifier = Parser.getTokenAtDocumentPos(document, position);
        if (!identifier) return null;
        return this.findReferenceLocation(identifier, (context && context.includeDeclaration), cancellationToken);
    }

    findReferenceLocation(identifier, includeDeclaration, cancellationToken) {

        if (!identifier || identifier.length < 1) return null;

        const project = this._project;
        if (!project.isValid()) return null;

        const sources = project.getAsmSourceFiles();
        if (!sources) return null;

        const locations = [];

        const options = {
            toolkit: project.toolkit
        };

        for (const filename of sources) {

            const ast = Parser.parseFile(filename, options);
            if (!ast) continue;

            const tokens = ast.tokens;
            if (!tokens) continue;

            for (const token of tokens) {

                if (cancellationToken && cancellationToken.isCancellationRequested) return null;

                if (token.type != TokenType.Identifier) continue;
                if (token.isDeclaration() && !includeDeclaration) continue;
                if (token.text != identifier) continue;

                const range = token.range;

                locations.push({
                    range: {
                        start: { line: range.row, character: range.col },
                        end: { line: range.row, character: range.col + range.length },
                        isEmpty: false,
                        isSingleLine: true
                    },
                    uri: vscode.Uri.file(filename)
                });
            }
        }

        if (locations.length < 1) return null;

        return locations;
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Parser: Parser,
    LanguageFeatureProvider: LanguageFeatureProvider
}
