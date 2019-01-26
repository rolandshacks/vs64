//
// VS64 Extension
//

const path = require('path');
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
        this._env = {};
        this._debugger = null;

        this._state = {
            assemblerProcess: null,
            emulatorProcess: null
        };
    }

    get settings() {
        return this._settings;
    }

    get env() {
        return this._env;
    }

    activate() {

        var thisInstance = this;
        var context = this._context;
        var env = this._env;
        var settings = this._settings;
        var state = this._state;

        { // load environment info
            env.extensionPath = context.extensionPath;
            env.workspacePath = vscode.workspace.rootPath;
            env.outputDir = Constants.OutputDirectory;
            env.outputPath = path.join(env.workspacePath, env.outputDir);
        }

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
                if (Constants.AlwaysShowOutputChannel) output.show(true);
                output.clear();
                thisInstance.commandBuild();
            });
            context.subscriptions.push(disposable);
        }

        { // register command: run
            let disposable = vscode.commands.registerCommand('c64.run', function() {
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

        if (this._settings.backgroundBuild) {
            this.commandBuild();
        }

        // start debugger adapter
        {
            this._debugger = new Debugger(this);
            this._debugger.start();
        }

    }

    clear() {
    }

    update() {
    }

    onSave(textDocument) {
        if (this._settings.backgroundBuild) {
            this.commandBuild();
        }
    }

    clearDiagnostics() {
        this._diagnostics.clear();
    }

    updateDiagnostics(procInfo) {

        if (null != vscode.window.activeTextEditor) {
            var diagnosticsData = this._diagnostics.update(procInfo);
            this._diagnostics.collection.set(vscode.window.activeTextEditor.document.uri, diagnosticsData);
        }

    }

    deactivate() {
        if (null != this._debugger) {
            this._debugger.stop();
            this._debugger = null;
        }
    }

    commandBuild(successFunction) {

        var settings = this._settings;
        var state = this._state;
        var output = this._output;

        if (false == settings.assemblerEnabled) {
            output.appendLine("please revise your assembler executable settings");
            return;
        }

        var filename = Utils.getCurrentAsmFile();
        if (null == filename) {
            output.appendLine("no source");
            return;
        }

        if (state.assemblerProcess != null && true != state.assemblerProcess.exited) {
            output.appendLine("assembler already running...");
            return;
        }

        var prgfilename = Utils.getOutputFilename(filename, "prg");
        var reportFilename = Utils.getOutputFilename(filename, "report");

        if (Utils.compareFileTime(filename, prgfilename) >= 0 &&
            Utils.compareFileTime(filename, reportFilename) >= 0) {
            output.appendLine("no need to build " + path.basename(filename));
            if (null != successFunction) {
                successFunction();
            }
            return;
        }

        this.clearDiagnostics();

        output.appendLine("building " + path.basename(filename));

        var outDir = path.dirname(prgfilename);
        Utils.mkdirRecursive(outDir);

        var executable = settings.assemblerPath;
        var args = [
            "-f", "cbm",
            "-o", prgfilename,
            "-r", reportFilename,
            filename
        ];

        if (settings.verbose) {
            var cmd = executable + " " + args.join(" ");
            output.appendLine(cmd);
        }

        var thisInstance = this;

        state.assemblerProcess = this.exec(
            executable, args, 
            function(procInfo) { // success function
                thisInstance.updateDiagnostics(procInfo);
                successFunction();
            },
            function(procInfo) { // error function
                thisInstance.updateDiagnostics(procInfo);
            }
        );
    }

    commandRun() {

        var settings = this._settings;
        var state = this._state;
        var output = this._output;

        if (false == settings.emulatorEnabled) {
            output.appendLine("please revise your emulator executable settings");
            return;
        }

        var filename = Utils.getCurrentAsmFile();
        if (null == filename) {
            output.appendLine("no source");
            return;
        }

        if (state.emulatorProcess != null && true != state.emulatorProcess.exited) {
            output.appendLine("emulator already running...");
            return;
        }

        var prgfilename = Utils.getOutputFilename(filename, "prg");

        output.appendLine("running " + path.basename(prgfilename));

        var executable = settings.emulatorPath;
        var args = [
            prgfilename
        ];

        if (settings.verbose) {
            var cmd = executable + " " + args.join(" ");
            output.appendLine(cmd);
        }

        state.emulatorProcess = this.exec(executable, args);

    }

    commandDebug() {

        var settings = this._settings;

        if (true != settings.debuggerEnabled || settings.debuggerPath == "") {
            this.commandRun();
            return;
        }

        var state = this._state;
        var output = this._output;

        var filename = Utils.getCurrentAsmFile();
        if (null == filename) {
            output.appendLine("no source");
            return;
        }

        var debuggerRunning = (state.debuggerProcess != null && true != state.debuggerProcess.exited);

        var prgfilename = Utils.getOutputFilename(filename, "prg");
        var symbolsFilename = Utils.getOutputFilename(filename, "labels");

        output.appendLine("debugging " + path.basename(prgfilename));

        var executable = settings.debuggerPath;

        if (false == debuggerRunning) {

            let args = [
                prgfilename
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
                "-symbols", symbolsFilename,
                "-prg", prgfilename,
                "-autojmp"
            ];

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
            stderr: []
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

    updateSettings() {

        var env = this._env;
        var settings = this._settings;

        settings.verbose = vscode.workspace.getConfiguration().get("c64.verbose")||false;

        if (true == settings.verbose) {
            console.log("[C64] extension verbose mode enabled");
        }

        settings.autoBuild = vscode.workspace.getConfiguration().get("c64.autoBuild")||true;
        if (true == settings.verbose && true == settings.autoBuild) {
            console.log("[C64] auto build enabled");
        }

        settings.backgroundBuild = vscode.workspace.getConfiguration().get("c64.backgroundBuild")||true;
        if (true == settings.verbose && true == settings.backgroundBuild) {
            console.log("[C64] background build enabled");
        }

        settings.assemblerPath = vscode.workspace.getConfiguration().get("c64.assemblerPath")||"";
        if (settings.assemblerPath == "") {
            settings.assemblerPath = path.join(env.extensionPath, "tools/acme");
        }
        settings.assemblerEnabled = (settings.assemblerPath != "");

        if (true == settings.verbose) {
            console.log("[C64] assembler path: " + settings.assemblerPath);
        }

        settings.emulatorPath = vscode.workspace.getConfiguration().get("c64.emulatorPath")||"";
        settings.emulatorEnabled = (settings.emulatorPath != "");

        if (true == settings.verbose) {
            console.log("[C64] emulator path: " + settings.emulatorPath);
        }

        settings.debuggerEnabled = vscode.workspace.getConfiguration().get("c64.debuggerEnabled")||false;
        settings.debuggerPath = vscode.workspace.getConfiguration().get("c64.debuggerPath")||"";
        if (settings.debuggerPath == "") {
            settings.debuggerEnabled = false;
        }

        if (true == settings.verbose) {
            if (settings.debuggerEnabled) {
                console.log("[C64] debugger path: " + settings.debuggerPath);
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
