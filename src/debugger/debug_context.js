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
const { VscodeUtils } = require('utilities/vscode_utils');
const { DebugSession } = require('debugger/debug_session');

const logger = new Logger("DebugContext");

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

        vscode.debug.registerDebugConfigurationProvider(Constants.DebuggerType6502, this);
        vscode.debug.registerDebugConfigurationProvider(Constants.DebuggerTypeVice, this);

        this._context.subscriptions.push(this);

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

    // create DebugAdapter configuration
    provideDebugConfigurations(folder, token) {
        const debugConfig = {
            type: "6502",
            request: "launch",
            name: "Launch 6502",
            program: ""
        };

        return debugConfig;
    }

    // update DebugAdapter configuration
    resolveDebugConfiguration(folder, debugConfig, token) {
        if (null != debugConfig && null != this._session) {

            if (null == debugConfig.type || debugConfig.type == "") {
                debugConfig.type = "6502";
            }

            if (null == debugConfig.request || debugConfig.request == "") {
                debugConfig.request = "launch";
            }

            if (null == debugConfig.name || debugConfig.name == "") {
                debugConfig.name = "Launch Program";
            }

            if (null == debugConfig.program || debugConfig.program == "") {

                const errMsg = "Could not launch debugger: Program file not specified.";
                logger.error(errMsg);
                vscode.window.showErrorMessage(errMsg);
                return null;
            }

            debugConfig.debugServer = this._session._port;
        }

        return debugConfig;
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    DebugContext: DebugContext
}
