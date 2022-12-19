/**
 *
 * VS64 Extension
 *
 */

//-----------------------------------------------------------------------------------------------//
// Check host environment
//-----------------------------------------------------------------------------------------------//

const process = require('process');

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

const Extension = require("./src/extension/extension.js");

//-----------------------------------------------------------------------------------------------//
// Module exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    activate: Extension.activate,       // required entry point for vscode extension mode
    deactivate: Extension.deactivate    // required entry point for vscode extension mode
};
