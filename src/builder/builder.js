//
// Builder
//

const fs = require('fs');
const path = require("path");

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { Logger, LogLevel } = require('utilities/logger');
const { Utils } = require('utilities/utils');
const { KickAssemblerInfo } = require('debugger/debug_info');

const logger = new Logger("Builder");

const BuildResult = {
    Success: 0,
    NoNeedToBuild: 1,
    Error: 2,
    ScanError: 3
};


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
        if (!project ||!project.isValid()) return false;
        return true;
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

        this.deleteDependencyFiles();        
    }

    #doInitialize() {
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

    async rebuild() {
        this.clean();
        return await this.build();
    }

    buildOutput(txt) {
        if (!txt) return;

        /*
        const pos = txt.indexOf('(');
        if (pos > 0) {
            const project = this._project;
            const filename = project.resolveFile(txt.substring(0, pos).trim());
            if (filename) {
                txt = filename + txt.substring(pos);
            }
        }
        */

        if (this._onBuildOutputFn) {
            this._onBuildOutputFn(txt);
        } else {
            logger.info(txt);
        }

    }

    async build() {
        if (!this.#validate()) {
            return { error: BuildResult.Error, description: "configuration error" };
        }

        const project = this._project;

        if (!project.hasSources()) {
            logger.debug("build.run: empty project");
            return { error: BuildResult.NoNeedToBuild };
        }

        try {
            this.#doInitialize();
        } catch (err) {
            logger.error("build.run: initialization failed: " + err);
            return { error: BuildResult.Error, description: "initialization failed: " + err };
        }

        project.createBuildFile();
        this.createDependencyFiles();

        try {
            await this.#doNinjaBuild();
        } catch (err) {
            logger.error("build.run: failed: " + err);
            return { error: BuildResult.Error, description: err };
        } finally {
            logger.notWhen(LogLevel.Trace, () => {
                this.deleteDependencyFiles();
            });            
        }

        return { error: BuildResult.Success };
    }

    async #doNinjaBuild() {
        if (!this.#validate()) return;

        const instance = this;

        const project = this._project;
        const toolkit = project.toolkit;
        const settings = this._settings;

        if (!toolkit) {
            throw ("No toolkit specified in the project configuration");
        }

        logger.debug("build.run");

        const executable = project.ninja || settings.ninjaExecutable;

        const args = [
            "-f", project.buildfile
        ];

        logger.when(LogLevel.Trace, () => {
            args.push("-d");
            args.push("keepdepfile");
        });

        logger.notWhen(LogLevel.Debug, () => {
            args.push("--quiet");
        });

        let proc = null;

        try {
            proc = await Utils.exec(
                executable,
                args,
                {
                    sync: true,
                    onstdout: (data) => {
                        instance.buildOutput(data);
                    },
                    onstderr: (data) => {
                        instance.buildOutput(data);
                    }
                }
            );
        } catch (procInfo) {

            instance.#generateAdditionalErrorInfo();

            const msg = procInfo.errorInfo ?
                "failed to run build process \"" + executable + "\" (" + procInfo.errorInfo.code + ")" :
                "failed with exit code " + procInfo.exitCode;
            throw(msg);
        }

        if (proc && proc.exitCode != 0) {
            throw("failed with exit code " + proc.exitCode);
        }
    }

    createDependencyFiles() {

        const project = this._project;

        //const toolkit = project.toolkit;        
        //if (toolkit.isLLVM) return; // llvm or gcc will do

        const buildTree = project.buildTree;
        if (!buildTree) return;

        buildTree.deps.forEach((to, from) => {
            this.#createDependencyFile(to + ".d", to, from);
        });

    }

    deleteDependencyFiles() {

        const project = this._project;
        const buildTree = project.buildTree;
        if (!buildTree) return;

        buildTree.deps.forEach((to, _from_) => {
            const filename = to + ".d";
            if (fs.existsSync(filename)) {
                fs.unlinkSync(filename);
            }            
        });
    }

    #createDependencyFile(filename, target, dependencies) {

        let s = "";

        s += target + ":";

        if (dependencies) {
            if (typeof dependencies === 'string') {
                s += " \\\n";
                s += "  " + dependencies;
            } else {
                for (let i=0; i<dependencies.length; i++) {
                    s += " \\\n";
                    s += "  " + dependencies[i];
                }
            }
        }

        s += '\n';

        try {
            const parentDir = path.dirname(filename);
            Utils.createFolder(parentDir);
            fs.writeFileSync(filename, s, "utf8");
        } catch (err) {
            console.log("failed to write dependency file: " + err);
        }

    }

    #generateAdditionalErrorInfo() {
        const project = this._project;
        const toolkit = project.toolkit;

        if (!toolkit.isKick) return;

        const asmInfoFile = path.resolve(project.builddir, project.name + ".info");
        const asmInfo = KickAssemblerInfo.read(asmInfoFile);

        if (!asmInfo) return;

        const errors = asmInfo.getErrors();
        if (!errors) return;

        for (const error of errors) {
            const msg = error.filename + "(" + error.range.startLine + "," + error.range.startPosition + ") : " + error.level + " : " + error.message;
            this.buildOutput(msg);
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
