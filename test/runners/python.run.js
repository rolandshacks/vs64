//
// Standalone runner
//

const path = require('path');

//-----------------------------------------------------------------------------------------------//
// Init module and lookup path
//-----------------------------------------------------------------------------------------------//

global._sourcebase = path.resolve(__dirname, "../src");
global.BIND = function (_module) {
    _module.paths.push(global._sourcebase);
};

// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { Logger, LogLevel } = require('utilities/logger');
const { Utils } = require('utilities/utils');

function findPython() {

    //const pythonExecutable = await Utils.getDefaultPythonExecutablePath();
    //console.log("python: " + pythonExecutable);

    const _pythonExecutable_ = Utils.getDefaultPythonExecutablePath();
    console.log("XXX");

}

function main() {
    Logger.setGlobalLevel(LogLevel.Trace);

    findPython();
}

main();
