//
// Diagnostic Provider
//

const vscode = require('vscode');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
var Constants = require('src/constants');
var Utils = require('src/utils');

//-----------------------------------------------------------------------------------------------//
// Diagnostic Provider
//-----------------------------------------------------------------------------------------------//

class DiagnosticProvider {

    constructor(extension) {
        this._extension = extension;
        this._context = extension._context;
        this._diagnostics = null;

        {
            this._collection = vscode.languages.createDiagnosticCollection(Constants.AssemblerLanguageId);
            this._context.subscriptions.push(this._collection);
        }

    }

    clear() {
        this._diagnostics = null;
        if (null != vscode.window.activeTextEditor) {
            this._collection.set(vscode.window.activeTextEditor.document.uri, null);
        }
    }

    update(buildProcessInfo) {
        if (null != vscode.window.activeTextEditor) {
            this._diagnostics = this.createDiagnosticsInfo(buildProcessInfo, vscode.window.activeTextEditor.document);
            this._collection.set(vscode.window.activeTextEditor.document.uri, this._diagnostics);
        }
    }

    // Error - File d:\Work\vs64\test\programs\src\test aaa 2.asm, line 12 (Zone <untitled>): Value not defined (qloop).
    // Warning - File d:\Work\vs64\test\programs\src\test aaa 2.asm, line 16 (Zone <untitled>): Label name not in leftmost column.

    parseError(str) {

        var WHITESPACES = " \t\r\n";

        var err = {};
        err.raw = str;

        var pos = 0;

        var s = str.toLowerCase();

        while (WHITESPACES.indexOf(s.charAt(pos)) >= 0) { pos++; }

        if (s.indexOf("error - file ") == 0) {
            err.isError = true;
            pos += 13;
        } else if (s.indexOf("warning - file ") == 0) {
            err.isWarning = true;
            pos += 15;
        } else {
            return null; // invalid start
        }

        var pos2 = s.indexOf(',' , pos);
        if (pos2 < pos + 3) {
            return null; // no filename
        }

        err.filename = str.substr(pos, pos2-pos).trim();

        pos = pos2 + 1;
        while (WHITESPACES.indexOf(s.charAt(pos)) >= 0) { pos++; }

        pos = s.indexOf("line", pos);
        if (pos < 0) {
            return null; // no line number token
        }

        pos += 4; // skip 'line' and whitespaces after
        while (WHITESPACES.indexOf(s.charAt(pos)) >= 0) { pos++; }

        pos2 = s.indexOf(' ', pos);
        if (pos2 < 0) {
            return null; // no line number
        }

        err.line = parseInt(str.substr(pos, pos2-pos)) - 1;

        pos = s.indexOf(':', pos2);
        if (pos < 0) {
            return null; // no text separator
        }
        pos++;

        err.text = str.substr(pos).trim(); // text

        return err;
    }

    createDiagnosticsInfo(buildProcessInfo, document) {

        /*
        if (0 == buildProcessInfo.exitCode) {
            return null; // no error;
        }
        */

        let set = [];

        for (let i=0, line; (line=buildProcessInfo.stdout[i]); i++) {
            let err = this.parseError(line);
            if (null == err) continue;
            set.push(err);
        }

        for (let i=0, line; (line=buildProcessInfo.stderr[i]); i++) {
            let err = this.parseError(line);
            if (null == err) continue;
            set.push(err);
        }

        if (set.length < 1) {
            return null; // no errors
        }

        let diagnostics = [];

        for (var i=0, err; (err=set[i]); i++) {

            let line = document.lineAt(err.line);

            let colStart = line.firstNonWhitespaceCharacterIndex;
            let colEnd = colStart + line.text.substr(colStart).trim().length;
            let range = new vscode.Range(err.line, colStart, err.line, colEnd);

            diagnostics.push(new vscode.Diagnostic(
                range,
                err.text,
                err.isWarning ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error
            ));
    
        }

        return diagnostics;
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = DiagnosticProvider;
