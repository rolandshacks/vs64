//
// Standalone runner
//

const path = require('path');
const fs = require('fs');

//-----------------------------------------------------------------------------------------------//
// Init module and lookup path
//-----------------------------------------------------------------------------------------------//

global._sourcebase = path.resolve(__dirname, "..");
global.BIND = function(_module) {
    _module.paths.push(global._sourcebase);
};

// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
var Constants = require('src/constants');
var Emulator = require('src/emulator');

//-----------------------------------------------------------------------------------------------//
// Application
//-----------------------------------------------------------------------------------------------//
class Application {
    constructor() {
        this._emulator = new Emulator();
    }

    run() {

        var emu = this._emulator;

        //emu.loadProgram('./programs/.cache/src/test.prg', Constants.ProgramAddressCorrection);
        //emu.loadReport('./programs/.cache/src/test.report');
        emu.loadDebugInfo("./example.report");

        //emu.clearBreakpoints();
        //emu.addBreakpoint(11);

        //emu.start();
        //setTimeout(function() { emu.stop(); }, 1000);
    }

    convertRoms() {
        this.convertRom("../roms/kernal.rom");
        this.convertRom("../roms/char.rom");
        this.convertRom("../roms/basic.rom");
        this.convertRom("../roms/1541.rom");
    }

    patchKernel() {
        var rom = fs.readFileSync("../roms/kernal.rom");
        rom[0x1d69] = 0x9f;
        fs.writeFileSync("../roms/fastkernal.rom", rom);
    }

    convertRom(filename) {

        var basename = path.basename(filename, ".rom");
        var romname = basename.toUpperCase();
        var outfilename = path.join(path.dirname(filename), basename) + ".js";
        var rom = null;

        try {
            rom = fs.readFileSync(filename);
        } catch (err) {
            if (err.code == 'ENOENT') {
                throw("file " + filename + " does not exist");
            } else {
                throw("unable to read file '" + filename + "'");
            }
        }

        var romString = rom.toString("base64");

        var s = "";
        
        s += "var _" + romname + " = Buffer.from(\n";
        s += "\"" + romString + "\", \"base64\");\n";
        s += "module.exports = _" + romname + ";\n";

        try {
            fs.writeFileSync(outfilename, s);
        } catch (err) {
            throw("unable to write file '" + outfilename + "'");
        }
    }
}

//-----------------------------------------------------------------------------------------------//
// Application entry
//-----------------------------------------------------------------------------------------------//
function main() {
    var app = new Application();
    if (null != app.init) app.init();
    app.run();
    if (null != app.shutdown) app.shutdown();
}

main();
