//
// Test debug info
//

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { fstat } = require('fs');

//-----------------------------------------------------------------------------------------------//
// Init module and lookup path
//-----------------------------------------------------------------------------------------------//

global._sourcebase = path.resolve(__dirname, "../src");
global.BIND = function(_module) {
    _module.paths.push(global._sourcebase);
};

// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { Logger, LogLevel } = require('utilities/logger');
const { DebugInfo } = require('debugger/debug_info');

const logger = new Logger("TestDebugInfo");

//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

let lastLoggerOutputLine = null;

function loggerSink(txt) {
    lastLoggerOutputLine = txt;
}

describe('debug_info', () => {
test("test debug info", async () => {

    Logger.setGlobalLevel(LogLevel.Trace);
    Logger.setSink(loggerSink);

    const project = {
        resolveFile: function(filename) {
            return filename;
        }
    };

    const debugInfo = new DebugInfo("data/example.report", project);

    const addessInfo = debugInfo.getAddressInfo(2070);

});

});
