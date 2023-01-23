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
        this.buildDefines = null;
        this.buildIncludePaths = null;
        this.buildArgs = null;
        this.emulatorExecutable = null;
        this.emulatorArgs = null;
        this.autoBuild = false;
        this.showWelcome = true;
    }

    disableWelcome(workspaceConfig) {
        const settings = this;
        settings.showWelcome = false;
        if (workspaceConfig) {
            // update globally
            workspaceConfig.update("vs64.showWelcome", settings.showWelcome, true);
        }
    }

    update(workspaceConfig) {
        if (!workspaceConfig) return;

        const settings = this;

        settings.showWelcome = workspaceConfig.get("vs64.showWelcome");
        if (null == settings.showWelcome) settings.showWelcome = true;

        settings.logLevel = workspaceConfig.get("vs64.loglevel")||"info";
        Logger.setGlobalLevel(settings.logLevel);

        this.setupAcme(workspaceConfig.get("vs64.acmeInstallDir"));
        this.setupCC65(workspaceConfig.get("vs64.cc65InstallDir"));

        settings.buildDefines = workspaceConfig.get("vs64.buildDefines")||"";
        settings.buildIncludePaths = workspaceConfig.get("vs64.buildIncludePaths")||"";
        settings.buildArgs = workspaceConfig.get("vs64.buildArgs")||"";
        settings.autoBuild = workspaceConfig.get("vs64.autoBuild");
        if (null == settings.autoBuild) settings.autoBuild = true;

        this.setupVice(workspaceConfig.get("vs64.emulatorExecutable"), workspaceConfig.get("vs64.emulatorArgs"));

        this.show();
    }

    setupAcme(installDir) {
        if (installDir) {
            this.acmeExecutable = path.resolve(installDir, Utils.normalizeExecutableName("acme"));
        } else {
            this.acmeExecutable = "acme";
        }
    }

    setupCC65(installDir) {
        if (installDir) {
            this.cc65Includes = path.resolve(installDir, "include");
            this.cc65Executable = path.resolve(installDir, "bin", Utils.normalizeExecutableName("cc65"));
            this.ca65Executable = path.resolve(installDir, "bin", Utils.normalizeExecutableName("ca65"));
            this.ld65Executable = path.resolve(installDir, "bin", Utils.normalizeExecutableName("ld65"));
        } else {
            this.cc65Includes = null;
            if (fs.existsSync("/usr/share/cc65/include")) {
                this.cc65Includes = "/usr/share/cc65/include";
            }
            this.cc65Executable = "cc65";
            this.ca65Executable = "ca65";
            this.ld65Executable = "ld65";
        }
    }

    setupVice(executablePath, args) {
        if (executablePath) {
            this.emulatorExecutable = Utils.normalizeExecutableName(executablePath);
        } else {
            this.emulatorExecutable = "x64sc";
        }

        this.emulatorArgs = args||"";
    }

    show() {
        const settings = this;

        logger.debug("[C64] extension log level is " + Logger.getLevelName(Logger.getGlobalLevel()));
        logger.debug("[C64] auto build is " + (settings.autoBuild ? "enabled" : "disabled"));

        logger.debug("[C64] acme executable: " + settings.acmeExecutable);
        logger.debug("[C64] cc65 executable: " + settings.cc65Executable);
        logger.debug("[C64] ca65 executable: " + settings.ca65Executable);
        logger.debug("[C64] ld65 executable: " + settings.ld65Executable);
        logger.debug("[C64] vice executable: " + settings.emulatorExecutable);

        /*
        this.logExecutableState(settings.acmeExecutable, "[C64] acme executable: " + settings.acmeExecutable);
        this.logExecutableState(settings.cc65Executable, "[C64] cc65 executable: " + settings.cc65Executable);
        this.logExecutableState(settings.ca65Executable, "[C64] ca65 executable: " + settings.ca65Executable);
        this.logExecutableState(settings.ld65Executable, "[C64] ld65 executable: " + settings.ld65Executable);
        this.logExecutableState(settings.emulatorExecutable, "[C64] emulator executable: " + settings.emulatorExecutable);
        */
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

        logger.warn(format + state);
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
