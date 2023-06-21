//
// Settings
//

const path = require('path');
const os = require('os');
const fs = require('fs');

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

const logger = new Logger("Settings");

//-----------------------------------------------------------------------------------------------//
// Constants
//-----------------------------------------------------------------------------------------------//

const Constants = {
    BinaryMonitorPort: 6502,
    ProjectConfigFile: "project-config.json",
    SupportedLanguageIds: [ "asm", "s", "c", "cpp", "h", "hpp", "cc", "hh", "res", "raw", "spm" ],
    AssemblerLanguageId: "asm",
    DebuggerType6502: "6502",
    DebuggerTypeVice: "vice",
    CppStandard: "c++20",
    AlwaysShowOutputChannel: false,
    ProgramAddressCorrection: true,
    AutoBuildDelayMs: 1250,
    ResourceFileFilter: "|res|raw|spm|spd|ctm|sid|wav|",
    CppFileFilter: "|c|cpp|cc|",
    AsmFileFilter: "|s|asm|",
    ObjFileFilter: "|o|obj|"
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

const Opcodes = [
    "ADC","AND","ASL","BCC","BCS","BEQ","BIT","BMI","BNE","BPL",
    "BRK","BVC","BVS","CLC","CLD","CLI","CLV","CMP","CPX","CPY",
    "DEC","DEX","DEY","EOR","INC","INX","INY","JMP","JSR","LDA",
    "LDX","LDY","LSR","NOP","ORA","PHA","PHP","PLA","PLP","ROL",
    "ROR","RTI","RTS","SBC","SEC","SED","SEI","STA","STX","STY",
    "TAX","TAY","TSX","TXA","TXS","TYA",

    // from illegal opcodes

    "SLA", "RLA", "ISC", "SRE", "SAX", "RRA", "LAX", "DCP", "ANC",
    "ALR", "ARR", "SBX", "SBC", "LAS", "JAM", "SHA", "SHX", "XAA",
    "SHY", "TAS"
];

//-----------------------------------------------------------------------------------------------//
// Settings
//-----------------------------------------------------------------------------------------------//
class Settings {
    constructor(extensionContext) {
        this.extensionContext = extensionContext;
        this.extensionPath = extensionContext.extensionPath;
        this.logLevel = LogLevel.Info;
        this.buildDefines = null;
        this.buildIncludePaths = null;
        this.buildArgs = null;
        this.emulatorExecutable = null;
        this.emulatorPort = Constants.BinaryMonitorPort;
        this.pythonExecutable = null;
        this.javaExecutable = null;
        this.ninjaExecutable = null;
        this.emulatorArgs = null;
        this.autoBuild = false;
        this.showWelcome = true;
        this.resourceCompiler = null;
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

        this.setupPython(workspaceConfig);
        this.setupJava(workspaceConfig);
        this.setupResourceCompiler(workspaceConfig);
        this.setupNinja(workspaceConfig);
        this.setupAcme(workspaceConfig);
        this.setupKickAssembler(workspaceConfig);
        this.setupCC65(workspaceConfig);
        this.setupLLVM(workspaceConfig);
        this.setupVice(workspaceConfig);

        this.show();
    }

    setupResourceCompiler(workspaceConfig) {
        let resourceCompiler = this.#getAbsDir(workspaceConfig.get("vs64.resourceCompiler"));
        if (resourceCompiler) {
            this.resourceCompiler = resourceCompiler;
        } else {
            this.resourceCompiler = path.resolve(this.extensionPath, "tools", "rc.py");
        }
    }

    setupNinja(workspaceConfig) {
        let executablePath = this.#getAbsDir(workspaceConfig.get("vs64.ninjaExecutable"));
        if (executablePath) {
            this.ninjaExecutable = Utils.normalizeExecutableName(executablePath);
        } else {
            const extensionPath = this.extensionPath;
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
        const installDir = this.#getAbsDir(workspaceConfig.get("vs64.acmeInstallDir"));
        if (installDir) {
            this.acmeExecutable = path.resolve(installDir, Utils.normalizeExecutableName("acme"));
        } else {
            this.acmeExecutable = "acme";
        }
    }

    setupKickAssembler(workspaceConfig) {
        const installDir = this.#getAbsDir(workspaceConfig.get("vs64.kickInstallDir"));
        if (installDir) {
            this.kickExecutable = path.resolve(installDir, "KickAss.jar");
        } else {
            this.kickExecutable = "KickAss.jar";
        }
    }

    setupCC65(workspaceConfig) {
        const installDir = this.#getAbsDir(workspaceConfig.get("vs64.cc65InstallDir"));
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
        const installDir = this.#getAbsDir(workspaceConfig.get("vs64.llvmInstallDir"));
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
        const executablePath = this.#getAbsDir(workspaceConfig.get("vs64.emulatorExecutable"));
        if (executablePath) {
            this.emulatorExecutable = Utils.normalizeExecutableName(executablePath);
        } else {
            this.emulatorExecutable = "x64sc";
        }
        this.emulatorPort = workspaceConfig.get("vs64.emulatorPort")||Constants.BinaryMonitorPort;
        this.emulatorArgs = workspaceConfig.get("vs64.emulatorArgs")||"";
    }

    setupPython(workspaceConfig) {
        const executablePath = this.#getAbsDir(workspaceConfig.get("vs64.pythonExecutable"));
        if (executablePath) {
            this.pythonExecutable = Utils.normalizeExecutableName(executablePath)
        } else {
            this.pythonExecutable = null; // Utils.getDefaultPythonExecutablePath();
            if (!this.pythonExecutable) {
                const platform = process.platform;
                if (platform == "win32") {
                    const embeddedPythonPath = path.resolve(this.extensionPath, "resources", "python", "python.exe");
                    if (Utils.fileExists(embeddedPythonPath)) {
                        this.pythonExecutable = Utils.normalizeExecutableName(embeddedPythonPath);
                    } else {
                        this.pythonExecutable = "python";
                    }
                } else {
                    this.pythonExecutable = "python3";
                }
            }
        }
    }

    setupJava(workspaceConfig) {
        const executablePath = this.#getAbsDir(workspaceConfig.get("vs64.javaExecutable"));
        if (executablePath) {
            this.javaExecutable = Utils.normalizeExecutableName(executablePath)
        } else {
            this.javaExecutable = "java";
        }
    }

    #getAbsDir(dir) {
        if (!dir || dir.length < 2) return dir;

        if (dir.startsWith('~/')) {
            return path.join(os.homedir(), dir.substring(1));
        }

        return dir;
    }

    show() {
        const settings = this;

        logger.debug("extension log level is " + Logger.getLevelName(Logger.getGlobalLevel()));
        logger.debug("auto build is " + (settings.autoBuild ? "enabled" : "disabled"));
        logger.debug("acme executable: " + settings.acmeExecutable);
        logger.debug("kickass executable: " + settings.kickExecutable);
        logger.debug("cc65 executable: " + settings.cc65Executable);
        logger.debug("ca65 executable: " + settings.ca65Executable);
        logger.debug("ld65 executable: " + settings.ld65Executable);
        logger.debug("vice executable: " + settings.emulatorExecutable);
        logger.debug("ninja executable: " + settings.ninjaExecutable);
        logger.debug("python executable: " + settings.pythonExecutable);
        logger.debug("java executable: " + settings.javaExecutable);
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Constants: Constants,
    Settings: Settings,
    AnsiColors: AnsiColors,
    Opcodes: Opcodes
};
