//
// Extension.
//

const path = require('path');
const process = require('process');

//-----------------------------------------------------------------------------------------------//
// Init module and lookup path
//-----------------------------------------------------------------------------------------------//

global._sourcebase = path.resolve(__dirname, "..");
const BIND = function(_module) {  if (null != _module.paths) { _module.paths.push(global._sourcebase); }};
global.BIND = BIND;
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Check host environment
//-----------------------------------------------------------------------------------------------//

let VSCodePluginHost = null;
try {
    VSCodePluginHost = require("vscode");
} catch (e) { ; }

if (null == VSCodePluginHost) {
    console.log("running outside vscode is not supported.");
    process.exit(1);
}

//-----------------------------------------------------------------------------------------------//
// Bind extension code
//-----------------------------------------------------------------------------------------------//

const { Extension } = require('extension/extension');

//-----------------------------------------------------------------------------------------------//
// Main
//-----------------------------------------------------------------------------------------------//

let extensionInstance = null;

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
// Module exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    activate: activate,       // required entry point for vscode extension mode
    deactivate: deactivate    // required entry point for vscode extension mode
};
