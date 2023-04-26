//
// Parser tests
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
const { AcmeParser } = require('parser/parser');
const { Logger, LogLevel } = require('utilities/logger');

const logger = new Logger("TestParser");

describe('language', () => {
test("language_basics", () => {

}); // test

});  // describe
