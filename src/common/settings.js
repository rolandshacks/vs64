//
// Settings
//

const path = require('path');
const os = require('os');
const fs = require('fs');
const process = require('process');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { Utils } = require('utilities/utils');
const { Logger, LogLevel } = require('logger/logger');
const { Constants } = require('common/constants');

const logger = new Logger("Settings");

//-----------------------------------------------------------------------------------------------//
// Settings
//-----------------------------------------------------------------------------------------------//
class Settings {
    constructor(extensionContext) {
        this.extensionContext = extensionContext;
        this.extensionPath = null != extensionContext ? extensionContext.extensionPath : "";
        this.logLevel = LogLevel.Info;
        this.buildDefines = null;
        this.buildIncludePaths = null;
        this.buildArgs = null;
        this.viceExecutable = null;
        this.vicePort = Constants.ViceBinaryMonitorPort;
        this.viceArgs = null;
        this.x16Executable = null;
        this.x16Args = null;
        this.pythonExecutable = null;
        this.javaExecutable = null;
        this.ninjaExecutable = null;
        this.autoBuild = false;
        this.showWelcome = true;
        this.resourceCompiler = null;
        this.basicCompiler = null;
        this.basicCharset = null;
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

        settings.recursiveLabelParsing = workspaceConfig.get("vs64.recursiveLabelParsing")||true;

        this.setupPython(workspaceConfig);
        this.setupJava(workspaceConfig);
        this.setupResourceCompiler(workspaceConfig);
        this.setupBasicCompiler(workspaceConfig);
        this.setupNinja(workspaceConfig);
        this.setupAcme(workspaceConfig);
        this.setupKickAssembler(workspaceConfig);
        this.setupLLVM(workspaceConfig);
        this.setupCC65(workspaceConfig);
        this.setupOscar64(workspaceConfig);
        this.setupVice(workspaceConfig);
        this.setupX16(workspaceConfig);

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

    setupBasicCompiler(workspaceConfig) {
        let basicCompiler = this.#getAbsDir(workspaceConfig.get("vs64.basicCompiler"));
        if (basicCompiler) {
            this.basicCompiler = basicCompiler;
        } else {
            this.basicCompiler = path.resolve(this.extensionPath, "tools", "bc.py");
        }

        const basicCharsetName = workspaceConfig.get("vs64.basicCharset")||Constants.BasicCharset1;
        this.basicCharset = basicCharsetName == Constants.BasicCharset2 ? 2 : 1;
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

    setupOscar64(workspaceConfig) {
        const installDir = this.#getAbsDir(workspaceConfig.get("vs64.oscar64InstallDir"));
        if (installDir) {
            const oscar64IncludesDir = path.resolve(installDir);
            this.oscar64IncludesC64 = [
                path.resolve(oscar64IncludesDir, "include"),
                path.resolve(oscar64IncludesDir, "include", "c64"),
                path.resolve(oscar64IncludesDir, "include", "audio"),
                path.resolve(oscar64IncludesDir, "include", "gfx"),
                path.resolve(oscar64IncludesDir, "include", "opp")
            ];

            this.oscar64IncludesC128 = [
                path.resolve(oscar64IncludesDir, "include"),
                path.resolve(oscar64IncludesDir, "include", "c128"),
                path.resolve(oscar64IncludesDir, "include", "audio"),
                path.resolve(oscar64IncludesDir, "include", "gfx"),
                path.resolve(oscar64IncludesDir, "include", "opp")
            ];

            this.oscar64Executable = path.resolve(installDir, "bin", Utils.normalizeExecutableName("oscar64"));
        } else {
            this.oscar64IncludesC64 = null;

            if (fs.existsSync("/usr/share/oscar64/include")) {
                this.oscar64IncludesC64 = [ "/usr/share/oscar64/include" ];
                this.oscar64IncludesC128 = [ "/usr/share/oscar64/include" ];
            }
            this.oscar64Executable = "oscar64";
        }
    }

    setupLLVM(workspaceConfig) {
        const installDir = this.#getAbsDir(workspaceConfig.get("vs64.llvmInstallDir"));
        if (installDir) {
            const llvmIncludesDir = path.resolve(installDir);

            this.llvmIncludesC64 = [
                path.resolve(llvmIncludesDir, "mos-platform", "common", "include"),
                path.resolve(llvmIncludesDir, "mos-platform", "commodore", "include"),
                path.resolve(llvmIncludesDir, "mos-platform", "c64", "include"),
                path.resolve(llvmIncludesDir, "lib", "clang", "16", "include")
            ];

            this.llvmIncludesC128 = [
                path.resolve(llvmIncludesDir, "mos-platform", "common", "include"),
                path.resolve(llvmIncludesDir, "mos-platform", "commodore", "include"),
                path.resolve(llvmIncludesDir, "mos-platform", "c128", "include"),
                path.resolve(llvmIncludesDir, "lib", "clang", "16", "include")
            ];

            this.llvmIncludesX16 = [
                path.resolve(llvmIncludesDir, "mos-platform", "common", "include"),
                path.resolve(llvmIncludesDir, "mos-platform", "commodore", "include"),
                path.resolve(llvmIncludesDir, "mos-platform", "cx16", "include"),
                path.resolve(llvmIncludesDir, "lib", "clang", "16", "include")
            ];

            this.clangExecutable = path.resolve(installDir, "bin", Utils.normalizeExecutableName("mos-clang++"));
            this.clangcExecutable = path.resolve(installDir, "bin", Utils.normalizeExecutableName("mos-clang"));

            const clangTidyExecutable = path.resolve(installDir, "bin", Utils.normalizeExecutableName("clang-tidy"));
            if (Utils.fileExists(clangTidyExecutable)) {
                workspaceConfig.update("C_Cpp.codeAnalysis.clangTidy.path", clangTidyExecutable, false);
            }

        } else {
            this.llvmIncludesC64 = null;
            this.llvmIncludesC128 = null;
            this.llvmIncludesX16 = null;
            this.clangExecutable = "mos-clang++";
            this.clangcExecutable = "mos-clang";
        }
    }

    getCompilerIncludes(toolkit, machine) {
        if (null == toolkit) return null;

        let compilerIncludes = null;

        if (toolkit.isLLVM) {
            if (machine == "x16" || machine == "cx16") {
                compilerIncludes = this.llvmIncludesX16;
            } else if (machine == "c128") {
                compilerIncludes = this.llvmIncludesC128;
            } else {
                compilerIncludes = this.llvmIncludesC64;
            }
        } else if (toolkit.isCC65) {
            compilerIncludes = this.cc65Includes;
        } else if (toolkit.isOscar64) {
            if (machine == "c128") {
                compilerIncludes = this.oscar64IncludesC128;
            } else {
                compilerIncludes = this.oscar64IncludesC64;
            }
        }

        return compilerIncludes;
    }

    #migrateConfig(workspaceConfig, oldProperty, newProperty, deleteOld) {
        const newValue = workspaceConfig.get(newProperty);
        const oldValue = workspaceConfig.get(oldProperty);

        if ((null == newValue || newValue == "") && null != oldValue && oldValue != "") {
            workspaceConfig.update(newProperty, oldValue, true);
            if (deleteOld) {
                workspaceConfig.update(oldProperty, undefined, true);
                workspaceConfig.update(oldProperty, undefined);
            }
        }
    }

    setupVice(workspaceConfig) {

        this.#migrateConfig(workspaceConfig, "vs64.emulatorExecutable", "vs64.viceExecutable")
        this.#migrateConfig(workspaceConfig, "vs64.emulatorPort", "vs64.vicePort")
        this.#migrateConfig(workspaceConfig, "vs64.emulatorArgs", "vs64.viceArgs")

        const executablePath = this.#getAbsDir(workspaceConfig.get("vs64.viceExecutable")||workspaceConfig.get("vs64.emulatorExecutable")||"x64sc");
        if (executablePath) {
            this.viceExecutable = Utils.normalizeExecutableName(executablePath);
        } else {
            this.viceExecutable = "x64sc";
        }
        this.vicePort = asInteger(workspaceConfig.get("vs64.vicePort")||workspaceConfig.get("vs64.emulatorPort"))||Constants.ViceBinaryMonitorPort;
        this.viceTimeout = asInteger(workspaceConfig.get("vs64.viceTimeout"))||Constants.ViceConnectTimeoutSec;
        this.viceArgs = workspaceConfig.    get("vs64.viceArgs")||workspaceConfig.get("vs64.emulatorArgs")||"";
    }

    setupX16(workspaceConfig) {
        const executablePath = this.#getAbsDir(workspaceConfig.get("vs64.x16Executable"));
        if (executablePath) {
            this.x16Executable = Utils.normalizeExecutableName(executablePath);
        } else {
            this.x16Executable = "x16emu";
        }
        this.x16Args = workspaceConfig.get("vs64.x16Args")||"";
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
        logger.debug("clang++ executable: " + settings.clangExecutable);
        logger.debug("clang executable: " + settings.clangcExecutable);
        logger.debug("acme executable: " + settings.acmeExecutable);
        logger.debug("kickass executable: " + settings.kickExecutable);
        logger.debug("cc65 executable: " + settings.cc65Executable);
        logger.debug("ca65 executable: " + settings.ca65Executable);
        logger.debug("ld65 executable: " + settings.ld65Executable);
        logger.debug("oscar64 executable: " + settings.oscar64Executable);
        logger.debug("vice executable: " + settings.viceExecutable);
        logger.debug("ninja executable: " + settings.ninjaExecutable);
        logger.debug("python executable: " + settings.pythonExecutable);
        logger.debug("java executable: " + settings.javaExecutable);
    }

}

function asInteger(v) {
    if (null == v) return v;

    try {
        return parseInt(v);
    } catch (_e) { ; }

    return null;
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Settings: Settings
};
