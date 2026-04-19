//
// Test disassembler
//

const fs = require('fs');
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

function disassembleFile(filename) {

    const ext = path.extname(filename).toLowerCase();
    if (ext != ".prg") {
        throw("unsupported file format: " + ext);
    }

    if (!fs.existsSync(filename)) {
        throw ("" + filename + "does not exist or is invalid");
    }

    const binary = fs.readFileSync(filename);
    const disassembler = new Disassembler();

    return disassembler.disassemble(binary);
}

describe('disassembler', () => {

test("disassembler", () => {
    // eslint-disable-next-line no-undef
    const _result = disassembleFile(__context.resolve("data:/test.prg"));
});

});
