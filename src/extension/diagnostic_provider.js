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
const { Constants } = require('settings/settings');

//-----------------------------------------------------------------------------------------------//
// Diagnostic Provider
//-----------------------------------------------------------------------------------------------//

class DiagnosticProvider {

    constructor(extension) {
        this._extension = extension;
        this._context = extension._extensionContext;
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

    parseError(str) {

        const WHITESPACES = " \t\r\n";

        const err = {
            raw: str
        };

        let pos = 0;

        let s = str.toLowerCase();

        while (WHITESPACES.indexOf(s.charAt(pos)) >= 0) { pos++; }

        if (s.indexOf("error - file ") == 0) {
            err.isError = true;
            pos += 13;
        } else if (s.indexOf("serious error - file ") == 0) {
            err.isError = true;
            pos += 21;
        } else if (s.indexOf("warning - file ") == 0) {
            err.isWarning = true;
            pos += 15;
        } else {
            return null; // invalid start
        }

        let pos2 = s.indexOf(',' , pos);
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

        for (let i=0, err; (err=set[i]); i++) {

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

module.exports = {
    DiagnosticProvider: DiagnosticProvider
}
