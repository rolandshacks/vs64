//
// Standalone runner
//

const path = require('path');
const fs = require('fs');

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
const { Logger, LogLevel } = require('utilities/logger');
const { StopWatch } = require('utilities/utils');
const { Parser } = require('language/language');

const logger = new Logger("LanguageRun");

//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

function runLanguage() {

    let src = "";

    /*
    for (let i=0; i<100000; i++) {
        src += ";\n";
        src += "; This is a comment\n";
        src += ";\n";
        src += "!set variable" + i + "=99\n";
        src += "data_label" + i + " !byte 1,2,3,4\n";
        src += "\n";
        src += "global_label" + i + " ; Global Label\n";
        src += "pha\n";
        src += "lda #$1\n";
        src += "jsr data_label\n";
        src += ".local_label" + i + " ; Local Label\n";
        src += "sta $0400\n";
        src += "pla\n";
        src += "rts\n";
        src += "\n";
    }
    */

    src += ";\n";
    src += "!macro testmacro {\n";
    src += "    rts\n";
    src += "}\n";
    src += "\n";
    src += "testlabel\n"
    src += "    +testmacro 123\n";
    src += "    rts\n";
    src += "\n";

    const stopWatch = new StopWatch();

    stopWatch.start();
    //console.profile();
    const ast = Parser.parse(src, "/tmp/test/file.asm");
    //console.profileEnd();
    stopWatch.stop();

    //ast.dump();

    console.log("elapsed: " + Math.floor(stopWatch.elapsedMillis) + " ms");

    const definition1 = ast.findDefinition("global_label3");
    const definition2 = ast.findDefinition(".local_label3");

    console.log("****");
}

function main() {
    Logger.setGlobalLevel(LogLevel.Trace);

    runLanguage();
}

main();
