//
// Settings
//

const path = require('path');
const fs = require('fs');
const vscode = require('vscode');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { Utils } = require('utilities/utils');
const { Logger, LogLevel } = require('utilities/logger');
const { VscodeUtils } = require('utilities/vscode_utils');

const logger = new Logger("Settings");

//-----------------------------------------------------------------------------------------------//
// Constants
//-----------------------------------------------------------------------------------------------//

const Constants = {
    ProjectConfigFile: "project-config.json",
    AssemblerLanguageId: "asm",
    DebuggerType6502: "6502",
    DebuggerTypeVice: "vice",
    AlwaysShowOutputChannel: false,
    ProgramAddressCorrection: true,
    AutoBuildDelayMs: 2000
};

const AnsiColors = {
    Reset: 0,
    Bold: 1,
    Underline: 4,
    Reverse: 7,

    Foreground: 0,
    Background: 10,

    Black: 30,
    Red: 31,
    Green: 32,
    Yellow: 33,
    Blue: 34,
    Magenta: 35,
    Cyan: 36,
    LightGrey: 37,

    DarkGrey: 90,
    LightRed: 91,
    LightGreen: 92,
    LightYellow: 93,
    LightBlue: 94,
    LightMagenta: 95,
    LightCyan: 96,
    White: 97
};

//-----------------------------------------------------------------------------------------------//
// Settings
//-----------------------------------------------------------------------------------------------//
class Settings {
    constructor() {
        this.logLevel = LogLevel.Info;
        this.compilerExecutable = null;
        this.compilerDefines = null;
        this.compilerIncludePaths = null;
        this.compilerArgs = null;
        this.emulatorExecutable = null;
        this.emulatorArgs = null;
        this.autoBuild = false;
    }

    update(workspaceConfig) {
        if (!workspaceConfig) return;

        const settings = this;

        settings.logLevel = workspaceConfig.get("c64.loglevel")||"info";
        Logger.setGlobalLevel(settings.logLevel);

        settings.compilerExecutable = Utils.findExecutable(workspaceConfig.get("c64.compilerExecutable")||"");
        settings.compilerDefines = workspaceConfig.get("c64.compilerDefines")||"";
        settings.compilerIncludePaths = workspaceConfig.get("c64.compilerIncludePaths")||"";
        settings.compilerArgs = workspaceConfig.get("c64.compilerArgs")||"";

        settings.emulatorExecutable = Utils.findExecutable(workspaceConfig.get("c64.emulatorExecutable")||"");
        settings.emulatorArgs = workspaceConfig.get("c64.emulatorArgs")||"";

        settings.autoBuild = workspaceConfig.get("c64.autoBuild")||true;

        this.show();
    }

    show() {
        const settings = this;

        logger.info("[C64] extension log level is " + Logger.getLevelName(Logger.getGlobalLevel()));
        logger.info("[C64] auto build is " + (settings.autoBuild ? "enabled" : "disabled"));
        this.logExecutableState(settings.compilerExecutable, "[C64] compiler executable: " + settings.compilerExecutable);
        this.logExecutableState(settings.emulatorExecutable, "[C64] emulator executable: " + settings.emulatorExecutable);
    }

    getExecutableState(filename) {

        if (null == filename || filename == "") return " [NOT SET]";

        const path = VscodeUtils.getAbsoluteFilename(filename);

        if (null == path || path == "") return " [INVALID]";

        try {
            let stat = fs.lstatSync(path);
            if (stat.isDirectory()) {
                return " [MISMATCH: directory instead of file name specified]";
            }
        } catch (err) {
            if (err.code == 'ENOENT') {
                return " [ERROR: file not found]";
            }
            return " [" + err.message + "]";
        }

        try {
            fs.accessSync(path, fs.constants.X_OK);
        } catch (err) {
            return " [" + err.message + "]";
        }

        return null;
    }

    logExecutableState(filename, format) {

        let state = this.getExecutableState(filename);
        if (null == state) {
            logger.info(format + " [OK]");
            return;
        }

        logger.error(format + state);
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Constants: Constants,
    Settings: Settings,
    AnsiColors: AnsiColors
};
