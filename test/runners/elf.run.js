//
// Standalone runner
//

const path = require('path');

//-----------------------------------------------------------------------------------------------//
// Init module and lookup path
//-----------------------------------------------------------------------------------------------//

global._sourcebase = path.resolve(__dirname, "../src");
global.BIND = function (_module) {
    _module.paths.push(global._sourcebase);
};

// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { Logger, LogLevel } = require('utilities/logger');
const { Elf } = require('elf/elf');

function runElf() {
    const filename = "data/test.prg.elf";
    //const filename = "D:/work/github/c64hacks/build/cppdemo.prg.elf";
    //const filename = "C:/work/c64/newproject/build/example.prg.elf";

    const elf = new Elf();
    elf.load(filename);

    {
        for (const section of elf.sections) {
            console.log(section.name);
        }
    }

    /*
    {
        const section = elf.getSection(".debug_line");
        if (section) {
            const entries = section.entries;
            if (entries) {
                for (const entry of entries) {
                    console.log("0x" + entry.address.toString(16) + ", " + entry.source + ":" + entry.line);
                }
            }
        }
    }
    */

    /*
    {
        const section = elf.getSection(".symtab");
        const data = section.buffer;

        const numSymbols = section.getSymbolCount();
        for (let i=0; i<numSymbols; i++) {
            const symbol = section.getSymbol(i);
            if (symbol.type == ElfSymbol.TypeObject) {
                console.log("Symbol: " + symbol.name + "  Value: " + symbol.value + "  Size: " + symbol.size);
            }
        }

    }
    */

    /*
    for (const section of elf.sections) {
        const data = section.buffer;
        console.log("Section: " + section.name + "  index: " + section.index);
    }

    {
        const section = elf.getSection(".debug_info");
        const data = section.buffer;
    }
    */

    console.log("DONE");

}

function main() {
    Logger.setGlobalLevel(LogLevel.Trace);

    runElf();
}

main();
