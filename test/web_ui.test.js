//
// Web UI test
//

const path = require('path');
const esbuild = require('esbuild');

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


//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

describe('webui', () => {

test("basics", async () => {

    const result = await esbuild.build({
        entryPoints: [path.resolve(__dirname, '../web/src/ui.js')],
        bundle: true,
        platform: 'browser',
        write: false,
        logLevel: 'silent'
    });

    expect(result.warnings).toEqual([]);

}); // test

});  // describe
