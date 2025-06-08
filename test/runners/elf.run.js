//
// Standalone runner
//

const path = require('path');

//-----------------------------------------------------------------------------------------------//
// Init module and lookup path
//-----------------------------------------------------------------------------------------------//

global._sourcebase = path.resolve(__dirname, "../../src");
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
    //const filename = "data/test.prg.elf";
    //const filename = "D:/work/github/c64hacks/build/cppdemo.prg.elf";
    const filename = "D:/Work/c64/elf_test/build/elftest.prg.elf";

    const elf = new Elf();
    elf.load(filename);

    if (true) {
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

    if (false) {
        const section = elf.getSection(".symtab");
        //const data = section.buffer;

        const numSymbols = section.getSymbolCount();
        for (let i=0; i<numSymbols; i++) {
            const symbol = section.getSymbol(i);
            console.log("Symbol \"" + symbol.name + "\", Value: " + symbol.value + ", Size: " + symbol.size + ", Type: " + symbol.type);
        }

    }

    if (true) {
        const section = elf.getSection(".debug_info");
        const units = section.entries;
        for (const unit of units) {
            if (unit.hasChildren) {
                for (const item of unit.children) {
                    dumpDwarfItem(item);
                }
            }
        }
    }

    console.log("DONE");
}

const SPACES = "                                                                                ";

function dumpDwarfItem(item, level) {

    level |= 0;

    const intent = SPACES.substring(0, level * 4);

    console.log(intent + item.tagName);

    if (item.hasChildren) {
        for (const child of item.children) {
            dumpDwarfItem(child, level + 1);
        }
    }
}

function main() {
    Logger.setGlobalLevel(LogLevel.Trace);

    runElf();
}

main();
