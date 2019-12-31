//
// VS64 Extension
//

const path = require('path');
const fs = require('fs');

const { spawn } = require('child_process');
const vscode = require('vscode');

//-----------------------------------------------------------------------------------------------//
// Init module and lookup path
//-----------------------------------------------------------------------------------------------//

global._sourcebase = path.resolve(__dirname, "..");
global.BIND = function(_module) {
    _module.paths.push(global._sourcebase);
};

// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
var Constants = require('src/constants');
var Utils = require('src/utils');
var DiagnosticProvider = require('src/diagnostic_provider');
var Debugger = require('src/debugger');

//-----------------------------------------------------------------------------------------------//
// Extension
//-----------------------------------------------------------------------------------------------//

class Extension {

    /**
     * @param {vscode.ExtensionContext} context
     */    
    constructor(context) {
        this._context = context;
        this._output = null;
        this._settings = {};
        this._debugger = null;

        this._state = {
            assemblerProcess: null,
            emulatorProcess: null
        };
    }

    get settings() {
        return this._settings;
    }

    hasWorkspace() {
        return (null != vscode.workspace.rootPath);
    }

    activate() {

        var thisInstance = this;
        var context = this._context;
        var settings = this._settings;
        var state = this._state;
        var hasWorkspace = this.hasWorkspace();

        { // load settings
            settings.extensionPath = context.extensionPath;
            this.updateSettings();

            let disposable = vscode.workspace.onDidChangeConfiguration(function(e) {
                thisInstance.updateSettings();
            });

            context.subscriptions.push(disposable);
        }

        { // create output channel
            this._output = vscode.window.createOutputChannel("C64");
        }

        var output = this._output;

        { // register command: build
            let disposable = vscode.commands.registerCommand('c64.build', function() {

                if (!hasWorkspace) {
                    vscode.window.showErrorMessage("No folder open in workspace");
                    return;
                }

                if (Constants.AlwaysShowOutputChannel) output.show(true);
                output.clear();
                thisInstance.commandBuild();
            });
            context.subscriptions.push(disposable);
        }

        { // register command: run
            let disposable = vscode.commands.registerCommand('c64.run', function() {

                if (!hasWorkspace) {
                    vscode.window.showErrorMessage("No folder open in workspace");
                    return;
                }

                if (Constants.AlwaysShowOutputChannel) output.show(true);
                output.clear();
                if (true == settings.autoBuild) {
                    thisInstance.commandBuild(thisInstance.commandRun.bind(thisInstance));
                } else {
                    thisInstance.commandRun();
                }
            });
            context.subscriptions.push(disposable);
        }

        { // register command: debug
            let disposable = vscode.commands.registerCommand('c64.debug', function() {

                if (!hasWorkspace) {
                    vscode.window.showErrorMessage("No folder open in workspace");
                    return;
                }

                if (Constants.AlwaysShowOutputChannel) output.show(true);
                output.clear();
                if (true == settings.autoBuild) {
                    thisInstance.commandBuild(thisInstance.commandDebug.bind(thisInstance));
                } else {
                    thisInstance.commandDebug();
                }
            });
            context.subscriptions.push(disposable);
        }

        { // create diagnostic provider
            this._diagnostics = new DiagnosticProvider(this);
        }

        // listen to changes between documents
        vscode.window.onDidChangeActiveTextEditor(function (e) {
            if (null == e) {
                thisInstance.clear();
            } else {
                thisInstance.update();
            }
        });

        // listen do document content changes
        vscode.workspace.onDidChangeTextDocument(function (e) {

            if (null == e || null == e.document || null == vscode.window.activeTextEditor) {
                thisInstance.clear();
                return;
            }

            if (e.document.languageId !== Constants.AssemblerLanguageId) {
                return;
            }

            if (e.document === vscode.window.activeTextEditor.document) {
                var textDocument = e.document;
                var isDirty = textDocument.isDirty;
                if (isDirty) {
                    thisInstance.update();
                } else {
                    thisInstance.onSave(textDocument);
                }
            }
        });

        if (this.hasWorkspace()) {

            if (this._settings.backgroundBuild) {
                this.commandBuild();
            }

            // start debugger adapter
            {
                this._debugger = new Debugger(this);
                this._debugger.start();
            }

            vscode.debug.onDidStartDebugSession(function(debugSession) {
                thisInstance.onDidStartDebugSession(debugSession);
            });

            vscode.window.onDidChangeActiveTextEditor(function(textEditor) {
                thisInstance.onDidChangeActiveTextEditor(textEditor);
            });

        }

    }

    onDidChangeActiveTextEditor(textEditor) {
        if (null == textEditor || null == textEditor.document) {
            return;
        }

        if (textEditor.document.languageId !== Constants.AssemblerLanguageId) {
            return;
        }

        if (this._settings.backgroundBuild) {
            this.commandBuild();
        }
    }

    onDidStartDebugSession(debugSession) {
    }

    clear() {
    }

    update() {
    }

    onSave(textDocument) {
        if (!this.hasWorkspace()) return;
        if (this._settings.backgroundBuild) {
            this.commandBuild();
        }
    }

    clearDiagnostics() {
        this._diagnostics.clear();
    }

    updateDiagnostics(procInfo) {
        this._diagnostics.update(procInfo);
    }

    deactivate() {
        if (null != this._debugger) {
            this._debugger.stop();
            this._debugger = null;
        }
    }

    getSessionState() {

        var settings = this._settings;
        var state = this._state;

        var s = {};

        if (state.assemblerProcess != null && true != state.assemblerProcess.exited) {
            s.assemblerRunning = true;
        }

        if (false == settings.assemblerEnabled) {
            s.assemblerDisabled = true;
        }

        if (state.emulatorProcess != null && true != state.emulatorProcess.exited) {
            s.emulatorRunning = true;
        }

        if (false == settings.emulatorEnabled) {
            s.emulatorDisabled = true;
        }

        if (state.debuggerProcess != null && true != state.debuggerProcess.exited) {
            s.debuggerRunning = true;
        }

        s.filename = Utils.getCurrentAsmFile();
        if (null == s.filename) {
            s.noSource = true;
            s.filename = "";
            s.prgfilename = "";
            s.reportFilename = "";
            s.labelsFilename = "";
        } else {
            s.prgfilename = Utils.getOutputFilename(s.filename, "prg");
            s.reportFilename = Utils.getOutputFilename(s.filename, "report");
            s.labelsFilename = Utils.getOutputFilename(s.filename, "labels");
    
            if (Utils.compareFileTime(s.filename, s.prgfilename) >= 0 &&
                Utils.compareFileTime(s.filename, s.reportFilename) >= 0 &&
                Utils.compareFileTime(s.filename, s.labelsFilename) >= 0) {
                s.noBuildNeeded = true;
            }
        }

        return s;
    }

    isBuildRequired() {
        var sessionState = this.getSessionState();
        if (null == sessionState) return false;
        if (sessionState.noBuildNeeded) return false;
        return true;
    }

    commandBuild(successFunction) {

        var settings = this._settings;
        var state = this._state;
        var output = this._output;

        var sessionState = this.getSessionState();

        if (sessionState.assemblerDisabled) {
            output.appendLine("please revise your assembler executable settings");
            return;
        }

        if (sessionState.assemblerRunning) {
            output.appendLine("assembler already running...");
            return;
        }

        if (sessionState.noSource) {
            output.appendLine("no source");
            return;
        }

        if (sessionState.noBuildNeeded) {
            output.appendLine("no need to build " + path.basename(sessionState.filename));
            if (null != successFunction) {
                successFunction();
            }
            return;
        }

        this.clearDiagnostics();

        output.appendLine("building " + path.basename(sessionState.filename));

        var sourceDir = path.dirname(sessionState.filename);

        var searchDirs = null;

        if (null != settings.assemblerSearchPath) {
            searchDirs = [];
            var dirs = settings.assemblerSearchPath.split(",").map(item => item.trim());
            for (var i=0, dir; dir=dirs[i]; i++) {
                if (path.isAbsolute(dir)) {
                    searchDirs.push(dir);
                } else {
                    searchDirs.push(path.resolve(sourceDir, dir));
                }
            }
        } else {
            searchDirs = [ sourceDir ];
        }

        var outDir = path.dirname(sessionState.prgfilename);
        Utils.mkdirRecursive(outDir);

        var executable = Utils.getAbsoluteFilename(settings.assemblerPath);
        var args = [
            "-f", "cbm",
            "-o", sessionState.prgfilename,
            "-r", sessionState.reportFilename,
            "--vicelabels", sessionState.labelsFilename
        ];

        if (settings.definitions) {
            var defs = settings.definitions.split(",");
            if (defs.length > 0) {
                for (var i = 0; i < defs.length; i++) {
                    args.push("-D" + defs[i].trim());
                }
            }
        }

        for (var i=0, searchDir; searchDir=searchDirs[i]; i++) {
            args.push("-I");
            args.push(searchDir);
        }

        args.push(... Utils.splitQuotedString(settings.assemblerArgs));

        args.push(sessionState.filename);

        if (settings.verbose) {
            var cmd = executable + " " + args.join(" ");
            output.appendLine(cmd);
        }

        var thisInstance = this;

        state.assemblerProcess = this.exec(
            executable, args, 
            function(procInfo) { // success function
                thisInstance.updateDiagnostics(procInfo);
                if (null != successFunction) {
                    successFunction();
                }
            },
            function(procInfo) { // error function
                if (procInfo.errorInfo) {
                    thisInstance._state.assemblerProcess = null;
                    output.appendLine("failed to start assembler - please check your settings!");
                    vscode.window.showErrorMessage("Failed to start assembler. Please check your settings!");
                } else {
                    thisInstance.updateDiagnostics(procInfo);
                }
            }
        );
    }

    commandRun() {

        var settings = this._settings;
        var state = this._state;
        var output = this._output;

        var sessionState = this.getSessionState();

        if (sessionState.emulatorDisabled) {
            output.appendLine("please revise your emulator executable settings");
            return;
        }

        if (sessionState.emulatorRunning) {
            output.appendLine("emulator already running...");
            return;
        }

        if (sessionState.noSource) {
            output.appendLine("no source");
            return;
        }

        output.appendLine("running " + path.basename(sessionState.prgfilename));

        var executable = Utils.getAbsoluteFilename(settings.emulatorPath);
        var args = [];
        args.push(...Utils.splitQuotedString(settings.emulatorArgs));
        args.push(sessionState.prgfilename);

        if (settings.verbose) {
            var cmd = executable + " " + args.join(" ");
            output.appendLine(cmd);
        }

        state.emulatorProcess = this.exec(executable, args);

    }

    commandDebug() {

        var settings = this._settings;
        var state = this._state;
        var output = this._output;

        if (true != settings.debuggerEnabled || settings.debuggerPath == "") {
            this.commandRun();
            return;
        }

        var sessionState = this.getSessionState();

        if (sessionState.noSource) {
            output.appendLine("no source");
            return;
        }

        output.appendLine("debugging " + path.basename(sessionState.prgfilename));

        var executable = Utils.getAbsoluteFilename(settings.debuggerPath);

        if (false == sessionState.debuggerRunning) {

            let args = [
                sessionState.prgfilename
            ];

            if (settings.verbose) {
                let cmd = executable + " " + args.join(" ");
                output.appendLine(cmd);
            }

            state.debuggerProcess = this.exec(executable, args);

        } else {

            output.appendLine("injecting program to running debugger");

            let args = [
                "-pass",
                "-symbols", sessionState.labelsFilename,
                "-prg", sessionState.prgfilename,
                "-autojmp"
            ];

            args.push(...Utils.splitQuotedString(settings.debuggerArgs));

            if (settings.verbose) {
                let cmd = executable + " " + args.join(" ");
                output.appendLine(cmd);
            }

            this.exec(executable, args);

        }

    }

    exec(executable, args, successFunction, errorFunction) {

        var cmd = executable + " " + args.join(" ");

        var output = this._output;

        const proc = spawn(executable, args);

        var procInfo = {
            process: proc,
            exited: false,
            stdout: [],
            stderr: [],
            errorInfo: null
        };

        proc.stdout.on('data', (data) => {
            var lines = (data+"").split('\n');
            for (var i=0, line; (line=lines[i]); i++) {
                if (null == line) continue;
                if (line.trim().length > 0) {
                    output.appendLine(line);
                    procInfo.stdout.push(line);
                }
            }
        });
        
        proc.stderr.on('data', (data) => {
            var lines = (data+"").split('\n');
            for (var i=0, line; (line=lines[i]); i++) {
                if (null == line) continue;
                if (line.trim().length > 0) {
                    output.appendLine(line);
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
                output.appendLine(`failed to start ${executable}`);
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
                    output.appendLine('done');
                }
            } else {
                if (null != errorFunction) {
                    errorFunction(procInfo);
                } else {
                    output.appendLine(`child process exited with code ${code}`);
                    vscode.window.showInformationMessage("failed: '" + cmd + "'");
                }
            }
        });

        return procInfo;
    }

    getExecutableState(filename) {

        if (null == filename || filename == "") return " [NOT SET]";

        var path = Utils.getAbsoluteFilename(filename);

        if (null == path || path == "") return " [INVALID]";

        try {
            var stat = fs.lstatSync(path);
            if (stat.isDirectory()) {
                return " [MISMATCH: directory instead of file name specified]";
            }
        } catch (err) {
            if (err.code == 'ENOENT') {
                return " [ERROR: file not found]";
            }
            return " [" + err.message + "]";
        }        

        try {
            fs.accessSync(path, fs.constants.X_OK);
        } catch (err) {
            return " [" + err.message + "]";
        }

        return null;
    }

    logExecutableState(filename, format) {

        var state = this.getExecutableState(filename);
        if (null == state) {
            console.log(format + " [OK]");
            return;
        }

        console.error(format + state);
    }

    updateSettings() {

        let settings = this._settings;

        let workspaceConfig = vscode.workspace.getConfiguration();

        settings.verbose = workspaceConfig.get("c64.verbose")||false;

        if (true == settings.verbose) {
            console.log("[C64] extension verbose mode enabled");
        }

        settings.autoBuild = workspaceConfig.get("c64.autoBuild")||true;
        if (true == settings.verbose && true == settings.autoBuild) {
            console.log("[C64] auto build enabled");
        }

        settings.definitions = workspaceConfig.get("c64.definitions") || "";

        settings.backgroundBuild = workspaceConfig.get("c64.backgroundBuild")||true;
        if (true == settings.verbose && true == settings.backgroundBuild) {
            console.log("[C64] background build enabled");
        }

        settings.assemblerPath = Utils.findExecutable(workspaceConfig.get("c64.assemblerPath")||"");
        settings.assemblerArgs = workspaceConfig.get("c64.assemblerArgs")||"";
        settings.assemblerSearchPath = workspaceConfig.get("c64.assemblerSearchPath");
        settings.assemblerEnabled = (settings.assemblerPath != "");

        if (true == settings.verbose) {
            this.logExecutableState(settings.assemblerPath, "[C64] assembler path: " + settings.assemblerPath);
        }

        settings.emulatorPath = Utils.findExecutable(workspaceConfig.get("c64.emulatorPath")||"");
        settings.emulatorArgs = workspaceConfig.get("c64.emulatorArgs")||"";
        settings.emulatorEnabled = (settings.emulatorPath != "");

        if (true == settings.verbose) {
            this.logExecutableState(settings.emulatorPath, "[C64] emulator path: " + settings.emulatorPath);
        }

        settings.debuggerEnabled = workspaceConfig.get("c64.debuggerEnabled")||false;
        settings.debuggerPath = Utils.findExecutable(workspaceConfig.get("c64.debuggerPath")||"");
        settings.debuggerArgs = workspaceConfig.get("c64.debuggerArgs")||"";
        if (settings.debuggerPath == "") {
            settings.debuggerEnabled = false;
        }

        if (true == settings.verbose) {
            if (settings.debuggerEnabled) {
                this.logExecutableState(settings.debuggerPath, "[C64] debugger path: " + settings.debuggerPath);
            } else {
                console.log("[C64] using emulator for debugging (c64 debugger disabled)");
            }
        }
    }
}

//-----------------------------------------------------------------------------------------------//
// Extension Entry Point
//-----------------------------------------------------------------------------------------------//

var extensionInstance = null;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    
    return new Promise(function(resolve /*, reject*/) {
        if (null == extensionInstance) {
            extensionInstance = new Extension(context);
            extensionInstance.activate();
        }
        resolve();
    });
}

function deactivate() {
    return new Promise(function(resolve /*, reject*/) {
        if (null == extensionInstance) {
            extensionInstance.deactivate();
            extensionInstance = null;
        }
        resolve();
    });
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    activate: activate,
    deactivate: deactivate
};
