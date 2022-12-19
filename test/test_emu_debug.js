//
// Standalone runner
//

const path = require('path');
const fs = require('fs');

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
const { Logger } = require('utilities/logger');
const { Emulator } = require('emulator/emu');

const logger = new Logger("InternalEmu");

const Utils = {

    getAbsoluteFilename: function(filename) {
        return filename;
    },

    findExecutable: function (filename) {

        if (null == filename || filename == "") return filename;

        if ("win32" == process.platform) {

            let ext = path.extname(filename);
            if (ext == "") {
                filename += ".exe";
            } else if (ext == ".") {
                filename += "exe";
            }

        }

        return filename;
    }
}

//-----------------------------------------------------------------------------------------------//
// Application
//-----------------------------------------------------------------------------------------------//
class Application {
    constructor() {
        this._emulator = new Emulator();
    }

    testFn() {

        let input = "C:\\tools\\c64\\vice\\x64sc";

        logger.info(Utils.findExecutable(input));
        logger.info(Utils.findExecutable("abc.exe"));
        logger.info(Utils.findExecutable("abc.com"));
        logger.info(Utils.findExecutable("abc"));
        logger.info(Utils.findExecutable("abc."));

    }

    run() {
        this.testFn();
    }

    convertRoms() {
        this.convertRom("../roms/kernal.rom");
        this.convertRom("../roms/char.rom");
        this.convertRom("../roms/basic.rom");
        this.convertRom("../roms/1541.rom");
    }

    patchKernel() {
        let rom = fs.readFileSync("../roms/kernal.rom");
        rom[0x1d69] = 0x9f;
        fs.writeFileSync("../roms/fastkernal.rom", rom);
    }

    convertRom(filename) {

        let basename = path.basename(filename, ".rom");
        let romname = basename.toUpperCase();
        let outfilename = path.join(path.dirname(filename), basename) + ".js";
        let rom = null;

        try {
            rom = fs.readFileSync(filename);
        } catch (err) {
            if (err.code == 'ENOENT') {
                throw("file " + filename + " does not exist");
            } else {
                throw("unable to read file '" + filename + "'");
            }
        }

        let romString = rom.toString("base64");

        let s = "";

        s += "let _" + romname + " = Buffer.from(\n";
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
    let app = new Application();
    if (null != app.init) app.init();
    app.run();
    if (null != app.shutdown) app.shutdown();
}

main();
