//
// Language Provider
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
const { LanguageServer } = require('language/language_server');
const { TokenType, StatementType } = require('language/language_base');

//-----------------------------------------------------------------------------------------------//
// LanguageProvider
//-----------------------------------------------------------------------------------------------//

class LanguageFeatureProvider {
    constructor(project, languageServer) {
        this._project = project;
        this._languageServer = languageServer;

    }

    // CompletionProvider

    async provideCompletionItems(document, position, cancellationToken) {
        const lang = this._languageServer;
        const identifier = lang.getTokenAtDocumentPos(document, position, true, true);
        if (!identifier) return null;

        const completedItems = lang.fuzzySearch(document.languageId, identifier);
        if (!completedItems || completedItems.length < 1) return null;

        const startPosition = new vscode.Position(position.line, position.character - identifier.length);

        const items = [];

        for (const item of completedItems) {
            if (cancellationToken && cancellationToken.isCancellationRequested) return null;
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
        const lang = this._languageServer;
        const project = this._project;
        if (!project.isValid()) return null;

        const options = {
            toolkit: project.toolkit,
            languageId: document.languageId,
            cancellationToken: cancellationToken
        };

        const ast = lang.getAstFromDocument(document, options);
        if (!ast || !ast.statements) return null;

        const documentSymbols = [];

        for (const statement of ast.statements) {

            if (cancellationToken && cancellationToken.isCancellationRequested) return null;
            if (statement.tokenCount < 1) continue;
            if (statement.type != StatementType.Definition) continue;

            const definitionType = statement.subtype;

            let details = null;

            let symbolKind = vscode.SymbolKind.Field;
            if (definitionType == StatementType.ConstantDefinition) {
                symbolKind = vscode.SymbolKind.Constant;
                let ofs = 2;
                if (statement.getToken(0).type != TokenType.Identifier) ofs++;
                if (statement.tokenCount > ofs) {
                    details = statement.getTokensAsString(ofs);
                }
            } else if (definitionType == StatementType.VariableDefinition) {
                symbolKind = vscode.SymbolKind.Variable;
                let ofs = 2;
                if (statement.getToken(0).type != TokenType.Identifier) ofs++;
                if (statement.tokenCount > ofs) {
                    details = statement.getTokensAsString(ofs);
                }

            } else if (definitionType == StatementType.FunctionDefinition) {
                symbolKind = vscode.SymbolKind.Function;
                let ofs = 2;
                if (statement.getToken(0).type != TokenType.Identifier) ofs++;
                if (statement.tokenCount > ofs) {
                    details = statement.getTokensAsString(ofs);
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
                if (statement.getToken(0).type == TokenType.LineNumber) continue;
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
        const lang = this._languageServer;
        const identifier = lang.getTokenAtDocumentPos(document, position);
        if (!identifier) return null;
        return this.findDefinitionLocation(identifier, cancellationToken);
    }

    findDefinitionLocation(identifier, cancellationToken) {

        if (!identifier || identifier.length < 1) return null;

        const lang = this._languageServer;
        const project = this._project;
        if (!project.isValid()) return null;

        const recursiveSearch = project.settings.recursiveLabelParsing||true;
        const sources = lang.getSources(recursiveSearch, project);
        if (!sources) return null;

        const locations = [];

        const options = {
            toolkit: project.toolkit,
            cancellationToken: cancellationToken
        };

        for (const filename of sources) {

            if (cancellationToken && cancellationToken.isCancellationRequested) return null;

            const ast = lang.getAstFromFile(filename, options);
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
        const lang = this._languageServer;
        const identifier = lang.getTokenAtDocumentPos(document, position);
        if (!identifier) return null;
        return this.findReferenceLocation(identifier, (context && context.includeDeclaration), cancellationToken);
    }

    findReferenceLocation(identifier, includeDeclaration, cancellationToken) {

        if (!identifier || identifier.length < 1) return null;

        const lang = this._languageServer;
        const project = this._project;
        if (!project.isValid()) return null;

        const recursiveSearch = project.settings.recursiveLabelParsing||true;
        const sources = lang.getSources(recursiveSearch, project);
        if (!sources) return null;

        const locations = [];

        const options = {
            toolkit: project.toolkit,
            cancellationToken: cancellationToken
        };

        for (const filename of sources) {

            const ast = lang.getAstFromFile(filename, options);
            if (!ast) continue;

            const tokens = ast.tokens;
            if (!tokens) continue;

            for (const token of tokens) {

                if (cancellationToken && cancellationToken.isCancellationRequested) return null;

                if (token.type != TokenType.Identifier && token.type != TokenType.Number) continue;
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
    LanguageFeatureProvider: LanguageFeatureProvider
}
