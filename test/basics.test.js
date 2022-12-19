//
// Test basics
//

const assert = require('assert');
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
const { Utils } = require('utilities/utils');
const { Logger, LogLevel } = require('utilities/logger');

const logger = new Logger("TestBasics");

//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

function toUint8Array(str) {

    const mem = new Uint8Array(str.length);

    let i=0;
    for (const c of str) {
        mem[i++] = c.charCodeAt(0);
    }

    return mem;
}

function strToBase64(str) {
    return toBase64(toUint8Array(str));
}

function toBase64(mem) {
    return Utils.toBase64(mem);
}

describe('basics', () => {
test("test base64", () => {

    const mem = new Uint8Array(16);
    for (let i=0; i<mem.length; i++) {
        mem[i] = ((i*19) & 0xff);
    }

    expect(toBase64(mem)).toBe("ABMmOUxfcoWYq77R5PcKHQ==");

    expect(strToBase64("")).toBe("");
    expect(strToBase64("f")).toBe("Zg==");
    expect(strToBase64("fo")).toBe("Zm8=");
    expect(strToBase64("foo")).toBe("Zm9v");
    expect(strToBase64("foob")).toBe("Zm9vYg==");
    expect(strToBase64("fooba")).toBe("Zm9vYmE=");
    expect(strToBase64("foobar")).toBe("Zm9vYmFy");

});

let lastLoggerOutputLine = null;

function loggerSink(txt) {
    lastLoggerOutputLine = txt;
}

function checkLastOutput(txt) {
    return lastLoggerOutputLine.indexOf(txt) >= 0;
}

test("basic logging output", () => {

    Logger.setGlobalLevel(LogLevel.Trace);
    Logger.setSink(loggerSink);
    Logger.enableColors(false);

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

});

});
