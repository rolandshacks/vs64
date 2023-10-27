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
const { TokenType, StatementType } = require('language/language_base');
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

    static parseFile(filename, options, cancellationToken) {
        const parser = Parser.fromType("asm");
        if (!parser) return null;
        parser._impl.parseFile(filename, options, cancellationToken);
        if (cancellationToken && cancellationToken.isCancellationRequested) return null;
        return parser._impl.ast;
    }

    static parse(source, filename, options, cancellationToken) {
        const parser = Parser.fromType("asm");
        if (!parser) return null;
        parser._impl.parse(source, filename, options, cancellationToken);
        if (cancellationToken && cancellationToken.isCancellationRequested) return null;
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

    // DocumentSymbolProvider

    provideDocumentSymbols(document, cancellationToken) {

        if (cancellationToken && cancellationToken.isCancellationRequested) return null;

        const project = this._project;
        if (!project.isValid()) return null;

        const options = {
            toolkit: project.toolkit
        };

        const text = document.getText();
        if (null == text) return null;

        const ast = Parser.parse(text, null, options, cancellationToken);
        if (!ast || !ast.statements) return null;

        const documentSymbols = [];

        for (const statement of ast.statements) {

            if (cancellationToken && cancellationToken.isCancellationRequested) return null;

            if (statement.type != StatementType.Definition) continue;

            const definitionType = statement.subtype;

            let details = null;

            let symbolKind = vscode.SymbolKind.Field;
            if (definitionType == StatementType.ConstantDefinition) {
                symbolKind = vscode.SymbolKind.Constant;
                if (statement.tokenCount > 2) {
                    details = statement.getTokensAsString(2);
                }
            } else if (definitionType == StatementType.AddressDefinition) {
                symbolKind = vscode.SymbolKind.Interface;
                if (statement.tokenCount > 2) {
                    details = statement.getTokensAsString(2);
                }
            } else if (definitionType == StatementType.MacroDefinition) {
                symbolKind = vscode.SymbolKind.Method;
                details = "macro";
            } else if (definitionType == StatementType.LabelDefinition) {
                if (statement.tokenCount < 2) symbolKind = vscode.SymbolKind.Function;
            }

            const statementRange = statement.range;
            const range = new vscode.Range(
                new vscode.Position(statementRange.row, statementRange.col),
                new vscode.Position(statementRange.row, statementRange.col + statementRange.length)
            );

            let txt = statement.text;

            const documentSymbol = new vscode.DocumentSymbol(
                txt,
                details,
                symbolKind,
                range, range
            );

            documentSymbols.push(documentSymbol);
        }

        if (documentSymbols.length < 1) return null;

        return documentSymbols;
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

        const recursiveSearch = project.settings.recursiveLabelParsing||true;
        const sources = project.getAsmSourceFiles(recursiveSearch);
        if (!sources) return null;

        const locations = [];

        const options = {
            toolkit: project.toolkit
        };

        for (const filename of sources) {

            if (cancellationToken && cancellationToken.isCancellationRequested) return null;

            const ast = Parser.parseFile(filename, options, cancellationToken);
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

        const recursiveSearch = project.settings.recursiveLabelParsing||true;
        const sources = project.getAsmSourceFiles(recursiveSearch);
        if (!sources) return null;

        const locations = [];

        const options = {
            toolkit: project.toolkit
        };

        for (const filename of sources) {

            const ast = Parser.parseFile(filename, options, cancellationToken);
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
