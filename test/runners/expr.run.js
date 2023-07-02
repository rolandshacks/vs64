//
// Expression solver runner
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
const { Expression } = require('utilities/expression');

function run() {

    //const str = "1 + ( 2 * 3 + 4 ) + 5";
    //const str = "$1F8+2";
    const str = ".sprites+1";

    const expr = new Expression(str, (name) => {
        if (name == "aaa") return "$100";
        return 0;
    });

    const result = expr.eval();
    console.log("RESULT: " + result);

}

function main() {
    Logger.setGlobalLevel(LogLevel.Trace);

    run();
}

main();
