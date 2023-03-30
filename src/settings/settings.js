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
    SupportedLanguageIds: [ "asm", "s", "c", "cpp", "h", "hpp", "cc", "hh" ],
    AssemblerLanguageId: "asm",
    DebuggerType6502: "6502",
    DebuggerTypeVice: "vice",
    CppStandard: "c++20",
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
    constructor(extensionContext) {
        this.extensionContext = extensionContext;
        this.logLevel = LogLevel.Info;
        this.buildDefines = null;
        this.buildIncludePaths = null;
        this.buildArgs = null;
        this.emulatorExecutable = null;
        this.ninjaExecutable = null;
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

        settings.buildDefines = workspaceConfig.get("vs64.buildDefines")||"";
        settings.buildIncludePaths = workspaceConfig.get("vs64.buildIncludePaths")||"";
        settings.buildArgs = workspaceConfig.get("vs64.buildArgs")||"";
        settings.autoBuild = workspaceConfig.get("vs64.autoBuild");
        if (null == settings.autoBuild) settings.autoBuild = true;

        this.setupNinja(workspaceConfig);
        this.setupAcme(workspaceConfig);
        this.setupCC65(workspaceConfig);
        this.setupLLVM(workspaceConfig);
        this.setupVice(workspaceConfig);

        this.show();
    }

    setupNinja(workspaceConfig) {
        let executablePath = workspaceConfig.get("vs64.ninjaExecutable");
        if (executablePath) {
            this.ninjaExecutable = Utils.normalizeExecutableName(executablePath);
        } else {
            const extensionPath = this.extensionContext.extensionPath;
            if (extensionPath) {
                const platform = process.platform;
                if (platform == "win32") {
                    executablePath = path.resolve(extensionPath, "resources", "ninja", "win", "ninja.exe");
                } else if (platform == "darwin") {
                    executablePath = path.resolve(extensionPath, "resources", "ninja", "mac", "ninja");
                    Utils.setExecutablePermission(executablePath);
                } else if (platform == "linux") {
                    executablePath = path.resolve(extensionPath, "resources", "ninja", "linux", "ninja");
                    Utils.setExecutablePermission(executablePath);
                }
            }
            if (executablePath && Utils.fileExists(executablePath)) {
                this.ninjaExecutable = executablePath;
            } else {
                this.ninjaExecutable = "ninja";
            }
        }
    }

    setupAcme(workspaceConfig) {
        const installDir = workspaceConfig.get("vs64.acmeInstallDir");
        if (installDir) {
            this.acmeExecutable = path.resolve(installDir, Utils.normalizeExecutableName("acme"));
        } else {
            this.acmeExecutable = "acme";
        }
    }

    setupCC65(workspaceConfig) {
        const installDir = workspaceConfig.get("vs64.cc65InstallDir");
        if (installDir) {
            this.cc65Includes = [ path.resolve(installDir, "include") ];
            this.cc65Executable = path.resolve(installDir, "bin", Utils.normalizeExecutableName("cc65"));
            this.ca65Executable = path.resolve(installDir, "bin", Utils.normalizeExecutableName("ca65"));
            this.ld65Executable = path.resolve(installDir, "bin", Utils.normalizeExecutableName("ld65"));
        } else {
            this.cc65Includes = null;
            if (fs.existsSync("/usr/share/cc65/include")) {
                this.cc65Includes = [ "/usr/share/cc65/include" ];
            }
            this.cc65Executable = "cc65";
            this.ca65Executable = "ca65";
            this.ld65Executable = "ld65";
        }
    }

    setupLLVM(workspaceConfig) {
        const installDir = workspaceConfig.get("vs64.llvmInstallDir");
        if (installDir) {
            const llvmIncludesDir = path.resolve(installDir);
            this.llvmIncludes = [
                path.resolve(llvmIncludesDir, "mos-platform", "common", "include"),
                path.resolve(llvmIncludesDir, "mos-platform", "commodore", "include"),
                path.resolve(llvmIncludesDir, "mos-platform", "c64", "include"),
                path.resolve(llvmIncludesDir, "lib", "clang", "16", "include")
            ];

            this.clangExecutable = path.resolve(installDir, "bin", Utils.normalizeExecutableName("mos-clang++"));

            const clangTidyExecutable = path.resolve(installDir, "bin", Utils.normalizeExecutableName("clang-tidy"));
            if (Utils.fileExists(clangTidyExecutable)) {
                workspaceConfig.update("C_Cpp.codeAnalysis.clangTidy.path", clangTidyExecutable, false);
            }

        } else {
            this.llvmIncludes = null;
            this.clangExecutable = "mos-clang++";
        }
    }

    setupVice(workspaceConfig) {
        const executablePath = workspaceConfig.get("vs64.emulatorExecutable");
        const args = workspaceConfig.get("vs64.emulatorArgs");
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
