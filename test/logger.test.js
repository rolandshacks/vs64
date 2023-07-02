//
// Logger tests
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

const logger = new Logger("TestLogger");

//-----------------------------------------------------------------------------------------------//
// Helpers
//-----------------------------------------------------------------------------------------------//

let lastLoggerOutputLine = null;

function loggerSink(txt) {
    lastLoggerOutputLine = txt;
    return false; // disable console output
}

function checkLastOutput(txt) {
    if (!lastLoggerOutputLine) return false;
    return lastLoggerOutputLine.indexOf(txt) >= 0;
}

//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

describe('logger', () => {

beforeEach(() => {
    Logger.pushGlobalLevel(LogLevel.Trace);
    Logger.setSink(loggerSink);
    Logger.enableColors(false);
});

afterEach(() => {
    Logger.popGlobalLevel();
});

test("logging output", () => {

    logger.trace("Trace output");
    expect(checkLastOutput("Trace output")).toBe(true);

    logger.debug("Debug output");
    expect(checkLastOutput("Debug output")).toBe(true);

    logger.info("Info output");
    expect(checkLastOutput("Info output")).toBe(true);

    logger.warn("Warning output");
    expect(checkLastOutput("Warning output")).toBe(true);

    logger.error("Error output");
    expect(checkLastOutput("Error output")).toBe(true);

}); // test

}); // describe
