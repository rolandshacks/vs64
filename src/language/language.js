//
// Language Features
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
const { TokenType } = require('language/language_base');
const { AcmeParser } = require('language/language_asm');

const logger = new Logger("Language");

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
            impl = new AcmeParser();
        }
        if (!impl) return null;
        const instance = new Parser(impl);
        return instance;
    }

    static parseFile(filename) {
        const parser = Parser.fromType("asm");
        if (!parser) return null;
        parser._impl.parseFile(filename);
        return parser._impl.ast;
    }

    static parse(source, filename) {
        const parser = Parser.fromType("asm");
        if (!parser) return null;
        parser._impl.parse(source, filename);
        return parser._impl.ast;
    }

    static getTokenAtDocumentPos(document, position) {
        const parser = Parser.fromType("asm");
        if (!parser) return null;
        return parser._impl.getTokenAtDocumentPos(document, position);
    }

}

//-----------------------------------------------------------------------------------------------//
// DefinitionProvider
//-----------------------------------------------------------------------------------------------//

class LanguageFeatureProvider {
    constructor(project, pathToUriFn) {
        this._project = project;
        this._pathToUriFn = pathToUriFn;
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

        const pathToUriFn = this._pathToUriFn;

        const sources = project.queryAllAsmFiles();
        const locations = [];

        for (const filename of sources) {

            if (cancellationToken && cancellationToken.isCancellationRequested) return null;

            const ast = Parser.parseFile(filename);
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
                uri: pathToUriFn ? pathToUriFn(filename) : filename
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

        const pathToUriFn = this._pathToUriFn;

        const sources = project.queryAllAsmFiles();
        const locations = [];

        for (const filename of sources) {

            const ast = Parser.parseFile(filename);
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
                    uri: pathToUriFn ? pathToUriFn(filename) : filename
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
