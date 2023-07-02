//
// Parser tests
//

const path = require('path');

//-----------------------------------------------------------------------------------------------//
// Init module and lookup path
//-----------------------------------------------------------------------------------------------//

global._sourcebase = path.resolve(__dirname, "../src");
global._mockup = path.resolve(__dirname, "../test/mockup");
global.BIND = function (_module) {
    _module.paths.push(global._mockup);
    _module.paths.push(global._sourcebase);
};

// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

describe('language', () => {
test("language_basics", () => {

}); // test

});  // describe
