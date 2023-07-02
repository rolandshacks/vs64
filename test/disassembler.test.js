//
// Test disassembler
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
const { Disassembler } = require('disassembler/disassembler');

//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

describe('disassembler', () => {

test("disassembler", () => {
    const disassembler = new Disassembler();

    // eslint-disable-next-line no-undef
    const _result_ = disassembler.disassembleFile(context.resolve("data/test.prg"));
});

});
