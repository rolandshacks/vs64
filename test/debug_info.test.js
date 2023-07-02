//
// Test debug info
//

const path = require('path');

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

//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

function loggerSink(_txt_) {
}

describe('debug_info', () => {
test("test debug info", async () => {

    Logger.setGlobalLevel(LogLevel.Trace);
    Logger.setSink(loggerSink);

    const project = {
        getAsmSourceFiles: function() {
            return [ "/work/testproject/main.asm" ];
        },

        resolveFile: function(filename) {
            return filename;
        }
    };

    // eslint-disable-next-line no-undef
    const debugInfo = new DebugInfo(context.resolve("/data/test.report"), project);

    const _addessInfo_ = debugInfo.getAddressInfo(2070);

});

});
