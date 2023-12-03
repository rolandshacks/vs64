//
// Standalone runner
//

const path = require('path');

//-----------------------------------------------------------------------------------------------//
// Init module and lookup path
//-----------------------------------------------------------------------------------------------//

global._sourcebase = path.resolve(__dirname, "../../src");
global._mockup = path.resolve(__dirname, "../mockup");
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
const { Parser } = require('language/language_server');

//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

function runAsmLanguage2() {

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

    const _definition1_ = ast.findDefinition("global_label3");
    const _definition2_ = ast.findDefinition(".local_label3");

    console.log("****");
}

function runAsmLanguage() {
    const source = ".macro set_border_color col\n";

    const options = {
        toolkit: {
            isLLVM: true
        }
    };

    const parser = Parser.fromType("asm")._impl;

    parser.parse(source, null, options);
    const ast = parser.ast;
    const tokens = ast.tokens;

    const tokenTexts = [];

    for (const token of tokens) {
        tokenTexts.push(token.text);
        console.log(`${token.text}`);
    }

    const definition = ast.findDefinition("hck");

    console.log("DONE");

}

function runBasicLanguage() {
    const source = "printLine:\n";

    const parser = Parser.fromType("bas")._impl;

    parser.parse(source);
    const ast = parser.ast;
    const tokens = ast.tokens;

    const tokenTexts = [];

    for (const token of tokens) {
        tokenTexts.push(token.text);
        console.log(`${token.text}`);
    }

    const definition = ast.findDefinition("a");

    console.log("DONE");

}

function main() {
    Logger.setGlobalLevel(LogLevel.Trace);

    runAsmLanguage();
}

main();
