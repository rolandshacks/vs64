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

    #clearCompileCommands() {

        this._compileCommands = null;

        const project = this._project;
        const filename = project.compilecommandsfile;

        try {
            if (fs.existsSync(filename)) {
                fs.unlinkSync(filename);
                logger.debug("build.clean: removed compile commands file");
            }
        } catch (e) {;}



    }

    getOutputFiles(buildType) {
        if (!this.#validate()) return [];

        const project = this._project;
        const files = [ project.outfile ];

        if (project.toolkit == "cc65" && project.compilecommandsfile != null) {
            files.push(project.compilecommandsfile);
        }

        if (buildType != BuildType.Release && project.buildfiles) {
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

        this.#clearCompileCommands();

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

        if (null == buildType && project.buildType != null) {
            buildType = (project.buildType.toLowerCase() == "release") ? BuildType.Release : BuildType.Debug;
        }

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
        } finally {
            this.#writeCompileCommands();
        }

        for (const outfile of this.getOutputFiles(buildType)) {
            if (!fs.existsSync(outfile)) {
                logger.error("build.run: missing output file " + outfile);
                return { error: BuildResult.Error, description: "missing output file " + outfile };
            }
        }

        const newTimestampOutput = this.#getFileTime(project.outfile);
        this.#writeCache(newTimestampOutput, buildType);

        return { error: BuildResult.Success };
    }

    querySourceByExtension(extensions) {
        const srcs = this._project.sources;
        if (!srcs || srcs.length < 1) return null;

        const result = [];

        for (const src of srcs) {
            const ext = path.extname(src).toLowerCase();
            if (ext && extensions.indexOf('|' + ext + '|') >= 0) {
                result.push(src);
            }
        }

        if (result.length < 1) return null;

        return result;
    }

    async #doBuild(modifiedFiles, buildType) {
        if (!this.#validate()) return;

        const project = this._project;
        const toolkit = project.toolkit;

        if (!toolkit || toolkit == "acme") {
            const asmSources = this.querySourceByExtension("|.s|.asm|");
            if (asmSources) {
                logger.debug("build.run: assembling files");
                await this.#doBuildAsmAcme(buildType, true, asmSources);
                logger.debug("build.run: assembling done");
            }
        }

        if (!toolkit || toolkit == "cc65") {
            const cppSources = this.querySourceByExtension("|.c|.cpp|.cc|");
            const asmSources = this.querySourceByExtension("|.s|.asm")||[];
            const objFiles = this.querySourceByExtension("|.o|.obj|")||[];

            if (cppSources) {
                logger.debug("build.run: compiling files");

                let buildCppError = null;

                for (const cppSource of cppSources) {

                    this.#writeBuildOutput("compiling " + cppSource);

                    const asmSource = path.resolve(project.builddir, path.basename(cppSource, path.extname(cppSource)) + ".s");

                    const buildNeeded = (modifiedFiles.indexOf(cppSource) >= 0);

                    try {
                        await this.#doBuildCpp(buildType, buildNeeded, cppSource, asmSource);
                    } catch (e) {
                        buildCppError = e;
                    }

                    if (asmSources.indexOf(asmSource) == -1) {
                        asmSources.push(asmSource);
                    }
                }

                if (buildCppError) throw(buildCppError);

                logger.debug("build.run: assembling files");

                let buildAsmError = null;

                for (const asmSource of asmSources) {

                    this.#writeBuildOutput("assembling " + asmSource);

                    const objFile = path.resolve(project.builddir, path.basename(asmSource, path.extname(asmSource)) + ".o");

                    try {
                        await this.#doBuildAsmCC65(buildType, true, asmSource, objFile);
                    } catch (e) {
                        buildAsmError = e;
                    }

                    if (objFiles.indexOf(objFile) == -1) {
                        objFiles.push(objFile);
                    }
                }

                if (buildAsmError) throw(buildAsmError);

                logger.debug("build.run: linking files");

                await this.#doBuildLink(buildType, true, objFiles);

                logger.debug("build.run: done");
            }
        }

    }

    async #doBuildCpp(buildType, buildNeeded, source, output) {

        const instance = this;
        const project = this._project;
        const settings = this._settings;
        const executable = project.compiler || settings.cc65Executable;

        const args = [
            "-o", output,
            "-t", "c64",
            "-g"
        ];

        if (buildType == BuildType.Release) {
            args.push("-O");     // enable optimization, inlining, "registry keyword"
            args.push("-Oirs");  // enable optimization, inlining, "registry keyword"
            //args.push("-Cl");  // enable static locals
        }

        const definitions = [ ...project.definitions ];
        for (const define of definitions) {
            args.push("-D" + define);
        }

        if (buildType != BuildType.Release) {
            args.push("-DDEBUG");
        }

        const includes = project.includes;
        for (const include of includes) {
            args.push("-I");
            args.push(include);
        }

        args.push(...project.args);

        args.push(source);

        const compilerIncludes = settings.cc65Includes || path.resolve(path.dirname(executable), "include");
        const compileArgs = [...args, "-I", compilerIncludes];

        const compileCommand = {
            directory: process.cwd(),
            arguments: compileArgs,
            file: source
        };

        this.#addCompileCommand(compileCommand);

        if (!buildNeeded) return;

        const result = await BuilderTask.run(
            executable,
            args,
            (txt) => { instance.buildOutput(txt); }
        );

        if (result.exitCode != 0) {
            throw("failed with exit code " + result.exitCode);
        }
    }

    async #doBuildAsmCC65(buildType, buildNeeded, source, output) {

        const instance = this;
        const project = this._project;
        const settings = this._settings;

        const executable = project.assembler || settings.ca65Executable;

        const args = [
            "-o", output,
            "-t", "c64",
            "-g"
        ];

        const definitions = [ ...project.definitions ];
        for (const define of definitions) {
            args.push("-D" + define);
        }

        if (buildType != BuildType.Release) {
            args.push("-DDEBUG");
        }

        const includes = project.includes;
        for (const include of includes) {
            args.push("-I");
            args.push(include);
        }

        args.push(...project.args);

        args.push(source);

        if (!buildNeeded) return;

        const result = await BuilderTask.run(
            executable,
            args,
            (txt) => { instance.buildOutput(txt); }
        );

        if (result.exitCode != 0) {
            throw("failed with exit code " + result.exitCode);
        }

    }

    async #doBuildLink(buildType, buildNeeded, sources) {

        if (!sources || sources.length < 1) return;

        const instance = this;
        const project = this._project;
        const settings = this._settings;

        const executable = project.assembler || settings.ld65Executable;

        const args = [
            "-o", project.outfile,
            "-t", "c64",
            "--dbgfile", project.outdebug
        ];

        if (project.startAddress) {
            args.push("-S");
            args.push(project.startAddress);
        }

        const definitions = [ ...project.definitions ];
        for (const define of definitions) {
            args.push("-D" + define);
        }

        args.push(...project.args);

        args.push(...sources);

        const libraries = [ ...project.libraries ];
        libraries.push("c64.lib");
        args.push(...libraries);

        if (!buildNeeded) return;

        const result = await BuilderTask.run(
            executable,
            args,
            (txt) => { instance.buildOutput(txt); }
        );

        if (result.exitCode != 0) {
            throw("failed with exit code " + result.exitCode);
        }
    }

    async #doBuildAsmAcme(buildType, buildNeeded, sources) {

        if (!sources || sources.length < 1) return;

        const instance = this;
        const project = this._project;
        const settings = this._settings;

        const executable = project.assembler || settings.acmeExecutable;

        const args = [
            "--msvc",
            "--maxerrors", "99",
            "-f", "cbm",
            "--cpu", "6510",
            "-o", project.outfile
        ];

        if (buildType != BuildType.Release) {
            const additionalFiles = [
                "-r", project.outdebug
            ];
            args.push(...additionalFiles);
        };

        const definitions = [ ...project.definitions ];
        for (const define of definitions) {
            args.push("-D" + define);
        }

        if (buildType != BuildType.Release) {
            args.push("-DDEBUG=1");
        }

        const includes = project.includes;
        for (const include of includes) {
            args.push("-I");
            args.push(include);
        }

        args.push(...project.args);

        args.push(...sources);

        if (!buildNeeded) return;

        const result = await BuilderTask.run(
            executable,
            args,
            (txt) => { instance.buildOutput(txt); }
        );

        if (result.exitCode != 0) {
            throw("failed with exit code " + result.exitCode);
        }

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

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Build: Build,
    BuildResult: BuildResult
}
