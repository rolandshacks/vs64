//
// Builder
//

const fs = require('fs');
const path = require("path");
const  process = require("process");
const { spawn } = require('child_process');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { Utils } = require('utilities/utils');
const { Logger } = require('utilities/logger');
const { Project } = require('project/project');

const logger = new Logger("Builder");

const BuildType = {
    Debug: 0,
    Release: 1
};

const BuildResult = {
    Success: 0,
    NoNeedToBuild: 1,
    Error: 2,
    ScanError: 3
};

const GenerateClangCrashReport = false;

class BuilderTask {

    static run(executable, args, outputFunction) {

        const commandLine = executable + " " + args.join(" ");
        logger.debug("build command: " + commandLine);

        return new Promise((resolve, reject) => {

            const proc = spawn(executable, args);

            const procInfo = {
                stdout: [],
                stderr: [],
                exitCode: 0
            };

            proc.stdout.on('data', (data) => {
                const lines = (data+"").split('\n');
                for (let i=0, line; (line=lines[i]); i++) {
                    if (null == line) continue;
                    if (line.trim().length > 0) {
                        procInfo.stdout.push(line);
                        if (outputFunction) outputFunction(line);
                    }
                }
            });

            proc.stderr.on('data', (data) => {
                const lines = (data+"").split('\n');
                for (let i=0, line; (line=lines[i]); i++) {
                    if (null == line) continue;
                    if (line.trim().length > 0) {
                        procInfo.stderr.push(line);
                        if (outputFunction) outputFunction(line);
                    }
                }
            });

            proc.on('error', (err) => {
                const txt = (err.code == "ENOENT") ?
                    "executable not found: '" + executable + "'" :
                    "failed to spawn process '" + executable + ": " + err.code;
                reject(txt, null, err);
            });

            proc.on('exit', (code) => {
                procInfo.exitCode = code;
                if (0 == code) {
                    resolve(procInfo);
                } else {
                    reject("process exited with error " + code, procInfo);
                }
            });
        });
    }
}

class Build {
    constructor(project) {
        this._project = project;
        this._settings = project.settings||{};
        this._onBuildOutputFn = null;
        this._compileCommands = null;
    }

    onBuildOutput(fn) {
        this._onBuildOutputFn = fn;
    }

    #writeBuildOutput(txt) {
        if (this._onBuildOutputFn) {
            this._onBuildOutputFn(txt);
        } else {
            logger.info(txt);
        }
    }

    #validate() {
        const project = this._project;
        if (!project ||!project.isValid()) return false;
        return true;
    }

    #addCompileCommand(compileCommand) {
        if (!this._compileCommands) {
            this._compileCommands = [];
        }

        this._compileCommands.push(compileCommand);
    }

    #writeCompileCommands() {

        if (!this._compileCommands) return;

        const project = this._project;
        const filename = project.compilecommandsfile;

        try {
            const json = (JSON.stringify(this._compileCommands, null, 4) + "\n").replace(/\\\\/g, "/");

            fs.writeFileSync(filename, json, 'utf8');
        } catch (e) {
            logger.error("could not write compile commands file: " + e);
        }

    }

    clean(cleanAll) {

        if (!this.#validate()) return;

        const project = this._project;

        if (project.outputs && project.outputs.length > 1) {
            for (const outfile of project.outputs) {
                try {
                    if (fs.existsSync(outfile)) {
                        fs.unlinkSync(outfile);
                        logger.debug("build.clean: removed output file " + outfile);
                    }
                } catch (e) {;}
            }
        }

        try {
            if (fs.existsSync(project.builddir)) {
                fs.rmdirSync(project.builddir);
                logger.debug("build.clean: removed project build directory");
            }
        } catch (e) {;}

        if (cleanAll) {
            const builddir = project.builddir;
            try {
                if (fs.existsSync(builddir)) {
                    fs.rmSync(builddir, { recursive: true, force: true });
                    logger.debug("build.clean: removed build directory " + builddir);
                }
            } catch (e) {;}
        }
    }

    #doInitialize(buildType) {
        if (!this.#validate()) return;

        const project = this._project;
        const builddir = project.builddir;

        try {
            if (!fs.existsSync(builddir)){
                fs.mkdirSync(builddir);
                logger.debug("build: created project build directory");
            }
        } catch (e) {;}
    }

    async rebuild(buildType) {
        this.clean();
        return await this.build(buildType);
    }

    buildOutput(txt) {
        if (!txt) return;

        const pos = txt.indexOf('(');
        if (pos > 0) {
            const project = this._project;
            const filename = project.resolveFile(txt.substring(0, pos).trim());
            if (filename) {
                txt = filename + txt.substring(pos);
            }
        }

        this.#writeBuildOutput(txt);

    }

    async build(buildType) {
        if (!this.#validate()) {
            return { error: BuildResult.Error, description: "configuration error" };
        }

        const project = this._project;
        let forcedRebuild = false;

        if (null == buildType && project.buildType != null) {
            buildType = (project.buildType.toLowerCase() == "release") ? BuildType.Release : BuildType.Debug;
        }

        const srcs = project.sources;
        if (!srcs || srcs.length < 1) {
            logger.debug("build.run: empty project");
            return { error: BuildResult.NoNeedToBuild };
        }

        try {
            if (forcedRebuild) this.clean(); // clean target files
            this.#doInitialize(buildType);
        } catch (err) {
            logger.error("build.run: initialization failed: " + err);
            return { error: BuildResult.Error, description: "initialization failed: " + err };
        }

        project.createBuildFile();

        try {
            await this.#doNinjaBuild(buildType, forcedRebuild);
        } catch (err) {
            logger.error("build.run: failed: " + err);
            return { error: BuildResult.Error, description: err };
        }

        for (const outfile of this.getOutputFiles(buildType)) {
            if (!fs.existsSync(outfile)) {
                logger.error("build.run: missing output file " + outfile);
                return { error: BuildResult.Error, description: "missing output file " + outfile };
            }
        }

        return { error: BuildResult.Success };
    }

    async #doNinjaBuild(buildType, forcedRebuild) {
        if (!this.#validate()) return;

        const instance = this;

        const project = this._project;
        const toolkit = project.toolkit;
        const settings = this._settings;

        if (!toolkit) {
            throw ("No toolkit specified in the project configuration");
        }

        logger.debug("build.run");

        const ninjaExecutable = project.ninja || settings.ninjaExecutable;
        const ninjaBuildFile = project.buildfile;

        const args = [
            "--quiet",
            "-f", ninjaBuildFile
        ];

        const result = await BuilderTask.run(
            ninjaExecutable,
            args,
            (txt) => { instance.buildOutput(txt); }
        );

        if (result.exitCode != 0) {
            throw("failed with exit code " + result.exitCode);
        }
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Build: Build,
    BuildResult: BuildResult
}
