//
// Test disassembler
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
const { Disassembler } = require('disassembler/disassembler');
const { Logger, LogLevel } = require('utilities/logger');

const logger = new Logger("TestDisassembler");

//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

describe('disassembler', () => {

test("disassembler", () => {

    const disassembler = new Disassembler();

    const result = disassembler.disassembleFile("data/test.prg");

    logger.info("DONE");

});


});
