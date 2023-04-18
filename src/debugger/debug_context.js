//
// Debugger
//

const path = require('path');
const fs = require('fs');
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
const { Utils } = require('utilities/utils');
const { Logger } = require('utilities/logger');
const { DebugSession } = require('debugger/debug_session');

const logger = new Logger("DebugContext");

//-----------------------------------------------------------------------------------------------//
// DebugConfigurationProvider
//-----------------------------------------------------------------------------------------------//
class DebugConfigurationProvider {
    constructor(debugType, debugContext) {
        this._debugType = debugType;
        this._debugContext = debugContext;
    }

    provideDebugConfigurations(folder, token) {
        const debugConfig = {
            type: this._debugType,
            request: "launch",
            name: "Launch " + this._debugType,
            preLaunchTask: "${defaultBuildTask}"
        };

        return debugConfig;
    }

    resolveDebugConfiguration(folder, debugConfig, token) {

        const session = this._debugContext._session;
        const project = this._debugContext._project;

        if (null == session) return;

        if (!debugConfig) debugConfig = {};

        if (null == debugConfig.type || debugConfig.type == "") {
            debugConfig.type = this._debugType;
        }

        if (null == debugConfig.request || debugConfig.request == "") {
            debugConfig.request = "launch";
        }

        if (null == debugConfig.name || debugConfig.name == "") {
            debugConfig.name = "Launch Program";
        }

        if (null == debugConfig.program || debugConfig.program == "") {

            if (project) {
                debugConfig.program = project.outfile;
            } else {
                const errMsg = "Could not launch debugger: Program file not specified.";
                logger.error(errMsg);
                vscode.window.showErrorMessage(errMsg);
                return null;
            }
        }

        if (null == debugConfig.debugServer) {
            if (null != session) debugConfig.debugServer = session._port;
        }

        return debugConfig;
    }

}

//-----------------------------------------------------------------------------------------------//
// DebugContext
//-----------------------------------------------------------------------------------------------//
class DebugContext {

    // create debugger instance
    constructor(extension) {
        this._extension = extension;
        this._context = extension._extensionContext;
        this._project = extension._project;
        this._settings = extension._settings;
        this._session = null;

        this._6502DebugConfigProvider = null;
        this._ViceDebugConfigProvider = null;
    }

    // start debugger
    start() {

        // create session
        this._session = new DebugSession(this);
        this._session.start();

        if (0 == this._session._port) {
            logger.error("could not start session");
            return;
        }

        //vscode.debug.registerDebugConfigurationProvider(Constants.DebuggerType6502, this);
        //vscode.debug.registerDebugConfigurationProvider(Constants.DebuggerTypeVice, this);
        //this._context.subscriptions.push(this);

        this._6502DebugConfigProvider = new DebugConfigurationProvider(Constants.DebuggerType6502, this);
        vscode.debug.registerDebugConfigurationProvider(Constants.DebuggerType6502, this._6502DebugConfigProvider);
        this._context.subscriptions.push(this._6502DebugConfigProvider);

        this._ViceDebugConfigProvider = new DebugConfigurationProvider(Constants.DebuggerTypeVice, this);
        vscode.debug.registerDebugConfigurationProvider(Constants.DebuggerTypeVice, this._ViceDebugConfigProvider);
        this._context.subscriptions.push(this._ViceDebugConfigProvider);


    }

    // stop debugger
    stop() {

        if (null != this._session) {
            this._session.stop();
            this._session = null;
        }
    }

    // dispose resource
    dispose() {
        this.stop();
    }

    findPrg(filename) {

        const workspacePath = vscode.workspace.rootPath;
        const outDir = path.join(workspacePath, Constants.OutputDirectory);

        let prg = Utils.findFile(outDir, filename)||"";

        if (prg.substr(0, workspacePath.length) == workspacePath) {
            prg = path.join("${workspaceFolder}", prg.substr(workspacePath.length));
        }

        return prg;
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    DebugContext: DebugContext
}
