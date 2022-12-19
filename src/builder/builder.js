//
// Builder
//

const fs = require('fs');
const path = require("path");
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
                reject("failed to spawn process '" + executable + ": " + err.code);
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
    }

    onBuildOutput(fn) {
        this._onBuildOutputFn = fn;
    }

    #validate() {
        const project = this._project;
        if (!project) return false;

        if (!project.basedir || project.basedir.length < 1) return false;
        if (!project.builddir || project.builddir.length < 1) return false;

        return true;
    }

    #getTimestamp() {
        return Math.floor(Date.now()/100 - 15750720000) // 10th seconds since 2020
    }

    #getFileTime(filename) {
        try {
            const stats = fs.statSync(filename);
            return stats.mtime;
        } catch (e) {
            return 0;
        }
    }

    #readCache() {
        if (!this.#validate()) return null;
        const project = this._project;
        const filename = project.cachefile;
        try {
            const json = fs.readFileSync(filename, 'utf8');
            const data = JSON.parse(json);
            return {
                time: data.time||0,
                buildType: data.build_type||"debug"
            };
        } catch (e) {
            return null;
        }
    }

    #writeCache(timestamp, buildType) {
        if (buildType == null) buildType = BuildType.Debug;

        if (!this.#validate()) return;
        const project = this._project;
        const filename = project.cachefile;

        const data = {
            time: timestamp||0,
            build_type: (buildType == BuildType.Release) ? "release" : "debug"
        };

        try {
            const json = JSON.stringify(data);
            fs.writeFileSync(filename, json, 'utf8');
        } catch (e) {
            logger.error("could not write cache file: " + e);
        }
    }

    getOutputFiles(buildType) {
        if (!this.#validate()) return [];

        const project = this._project;
        const files = [ project.outfile ];

        if (buildType != BuildType.Release) {
            files.push(...project.buildfiles);
        }

        return files;
    }

    clean(cleanAll) {

        if (!this.#validate()) return;

        const project = this._project;

        for (const outfile of this.getOutputFiles()) {
            try {
                if (fs.existsSync(outfile)) {
                    fs.unlinkSync(outfile);
                    logger.debug("build.clean: removed output file " + outfile);
                }
            } catch (e) {;}
        }

        try {
            if (fs.existsSync(project.cachefile)) {
                fs.unlinkSync(project.cachefile);
                logger.debug("build.clean: removed project cache file");
            }
        } catch (e) {;}

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
                logger.debug("build.clean: created project build directory");
            }
        } catch (e) {;}
    }

    async rebuild(buildType) {
        this.clean();
        return await this.build(buildType);
    }

    async build(buildType) {
        if (!this.#validate()) {
            return { error: BuildResult.Error, description: "configuration error" };
        }

        const project = this._project;

        try {
            project.scan();
        } catch (err) {
            logger.error("build.run: scan failed: " + err);
            return { error: BuildResult.ScanError, description: "Error - File " + err};
        }

        const files = project.files;
        if (!files || files.length < 1) {
            logger.debug("build.run: empty project");
            return { error: BuildResult.NoNeedToBuild };
        }

        let modifiedFiles = null;

        let timestampOutput = null;
        for (const outfile of this.getOutputFiles(buildType)) {
            const t = this.#getFileTime(outfile);
            if (null == timestampOutput || t < timestampOutput) {
                timestampOutput = t;
            }
            if (timestampOutput == 0) break;
        }

        if (timestampOutput > 0) {
            modifiedFiles = [];
            for (const file of files) {
                const timestampFile = this.#getFileTime(file);
                if (timestampFile >= timestampOutput) {
                    modifiedFiles.push(file);
                }
            }
        } else {
            modifiedFiles = files;
        }

        // no need to build, everything up-to-date
        if (modifiedFiles.length < 1) {
            logger.info("build.run: no work to do");
            return { error: BuildResult.NoNeedToBuild };
        }

        try {
            this.clean(); // clean target files
            this.#doInitialize(buildType);
        } catch (err) {
            logger.error("build.run: initialization failed: " + err);
            return { error: BuildResult.Error, description: "initialization failed: " + err };
        }

        try {
            await this.#doBuild(modifiedFiles, buildType);
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

        const newTimestampOutput = this.#getFileTime(project.outfile);
        this.#writeCache(newTimestampOutput);

        return { error: BuildResult.Success };
    }

    async #doBuild(modifiedFiles, buildType) {
        if (!this.#validate()) return;

        const instance = this;

        const project = this._project;
        const settings = this._settings;

        logger.debug("build.run: processing file " + project.main);

        const executable = project.compiler || settings.compilerExecutable;

        const args = [
            "-f", "cbm",
            "--cpu", "6510",
            "-o", project.outfile
        ];

        if (buildType != BuildType.Release) {
            const additionalFiles = [
                "-r", project.outreport,
                "--vicelabels", project.outlabel
            ];
            args.push(...additionalFiles);
        };

        const definitions = [ ...project.definitions ];
        for (const define of definitions) {
            args.push("-D" + define);
        }

        const includes = project.includes;
        for (const include of includes) {
            args.push("-I");
            args.push(include);
        }

        args.push(...project.args);

        args.push(project.main);

        const result = await BuilderTask.run(
            executable,
            args,
            (txt) => { instance.buildOutput(txt); }
        );

        if (result.exitCode != 0) {
            throw("failed with exit code " + result.exitCode);
        }

        logger.debug("build.run: done processing file " + project.main);
    }

    buildOutput(txt) {
        if (this._onBuildOutputFn) {
            this._onBuildOutputFn(txt);
        } else {
            logger.info(txt);
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
