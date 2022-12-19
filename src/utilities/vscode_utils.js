//
// Utilities
//

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const vscode = require('vscode');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
// none

//-----------------------------------------------------------------------------------------------//
// Utilities
//-----------------------------------------------------------------------------------------------//

const VscodeUtils = {
    debuggerLog: function(message) {
	    vscode.debug.activeDebugConsole.appendLine(message);
    },

    getAbsoluteFilename: function(filename) {
        if (!filename || path.isAbsolute(filename)) return filename;

        const workspaceRoot = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		    ? vscode.workspace.workspaceFolders[0].uri.fsPath : null;
	    if (!workspaceRoot) {
		    return;
    	}

        return path.resolve(workspaceRoot, filename);
    },

    exec: function(executable, args, outputChannel, successFunction, errorFunction) {

        let cmd = executable + " " + args.join(" ");

        let output = outputChannel;

        const proc = spawn(executable, args);

        let procInfo = {
            process: proc,
            exited: false,
            stdout: [],
            stderr: [],
            errorInfo: null
        };

        proc.stdout.on('data', (data) => {
            let lines = (data+"").split('\n');
            for (let i=0, line; (line=lines[i]); i++) {
                if (null == line) continue;
                if (line.trim().length > 0) {
                    if (output) output.appendLine(line);
                    procInfo.stdout.push(line);
                }
            }
        });

        proc.stderr.on('data', (data) => {
            let lines = (data+"").split('\n');
            for (let i=0, line; (line=lines[i]); i++) {
                if (null == line) continue;
                if (line.trim().length > 0) {
                    if (output) output.appendLine(line);
                    procInfo.stderr.push(line);
                }
            }
        });

        proc.on('error', (err) => {
            procInfo.exited = true;
            procInfo.errorInfo = err;
            if (null != errorFunction) {
                errorFunction(procInfo);
            } else {
                if (output) output.appendLine(`failed to start ${executable}`);
                vscode.window.showErrorMessage("failed to start '" + executable + "'");
            }
        });

        proc.on('exit', (code) => {
            procInfo.exited = true;
            procInfo.exitCode = code;
            if (0 == code) {
                if (null != successFunction) {
                    successFunction(procInfo);
                } else {
                    if (output) output.appendLine('done');
                }
            } else {
                if (null != errorFunction) {
                    errorFunction(procInfo);
                } else {
                    if (output) output.appendLine(`child process exited with code ${code}`);
                    vscode.window.showInformationMessage("failed: '" + cmd + "'");
                }
            }
        });

        return procInfo;
    },
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    VscodeUtils: VscodeUtils
}
