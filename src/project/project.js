//
// Project
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

const { Utils } = require('utilities/utils');
const { Arguments, ArgumentList } = require('utilities/args');
const { Logger } = require('utilities/logger');
const { Constants } = require('settings/settings');
const { Scanner } = require('project/scanner');
const { Toolkit } = require('project/toolkit');
const { Ninja, NinjaArgs } = require('project/ninja');
const { ProjectItem, TranslationList } = require('project/project_types');

const logger = new Logger("Project");

class Project {
    constructor(settings) {
        this._error = null;
        this._settings = settings;
        this._modificationTime = null;
        this._outputs = null;
        this._toolkit = null;
        this._buildTree = null;
    }

    get error() { return this._error; }
    get name() { return this._name; }
    get toolkit() { return this._toolkit; }
    get sources() { return this._sources; }
    get description() { return this._description_; }
    get basedir() { return this._basedir; }
    get builddir() { return this._builddir; }
    get dependencies() { return this._dependencies||[]; }
    get outname() { return this._outname; }
    get outfile() { return this._outfile; }
    get outdebug() { return this._outdebug; }
    get compilecommandsfile() { return this._compilecommandsfile; }
    get cpppropertiesfile() { return this._cpppropertiesfile; }
    get buildfiles() { return this._buildfiles; }
    get includes() { return this._includes; }
    get definitions() { return this._definitions; }
    get libraries() { return this._libraries; }
    get args() { return this._args; }
    get configfile() { return this._configfile; }
    get settings() { return this._settings; }
    get compiler() { return this._compiler; }
    get assembler() { return this._assembler; }
    get linker() { return this._linker; }
    get command() { return this._command; }
    get startAddress() { return this._startAddress; }
    get buildType() { return this._buildType; }
    get buildfile() { return this._buildfile; }
    get modificationTime() { return this._modificationTime; }
    get outputs() { return this._outputs; }
    get buildTree() { return this._buildTree; }
    get releaseBuild() {
        if (this.buildType && this.buildType.toLowerCase() == "release") return true;
        return false;
    }

    isValid() {
        if (this.error) return false;
        if (!this.basedir || this.basedir.length < 1) return false;
        if (!this.builddir || this.builddir.length < 1) return false;
        return true;
    }

    fromFileIfChanged(filename) {

        let reload = false;

        let modificationTime = Utils.getFileTime(filename);

        if (!this._modificationTime || (modificationTime && modificationTime > this._modificationTime)) {
            reload = true;
        } else {
            const configFile = path.resolve(filename);
            if (!this._configfile || configFile != this._configfile) {
                reload = true;
            }
        }

        if (reload) {
            this.fromFile(filename);
            return true;
        }

        return false;
    }

    fromFile(filename) {
        this._error = null;

        try {
            const stats = fs.statSync(filename);
            const json = fs.readFileSync(filename, 'utf8');
            this._configfile = path.resolve(filename);
            this._modificationTime = new Date(stats.mtime).getTime();
            this.fromJson(json);
        } catch(err) {
            this._error = err;
            throw(err);
        }
    }

    fromJson(json) {
        this._error = null;

        try {
            const data = JSON.parse(json);
            this.#init(data);
        } catch (err) {
            this._error = err;
            throw(err);
        }
    }

    #init(data) {

        this._data = data;

        this._basedir = (this._configfile != null) ? path.dirname(this._configfile) : "./";
        this._builddir = path.resolve(this._basedir, "build");
        this._buildfile = path.resolve(this._builddir, "build.ninja");
        this._compilecommandsfile = path.resolve(this._builddir, "compile_commands.json");
        this._cpppropertiesfile = path.resolve(this._basedir, ".vscode", "c_cpp_properties.json");

        this.#load();

        this._outname = this._name + ".prg";
        this._outfile = path.resolve(this._builddir, this._outname);

        const toolkit = this.toolkit;

        if (toolkit.isAcme) {
            this._outdebug = path.resolve(this._builddir, this._name + ".report");
        } else if (toolkit.isKick) {
            this._outdebug = path.resolve(this._builddir, this._name + ".dbg");
        } else if (toolkit.isLLVM) {
            this._outdebug = path.resolve(this._builddir, this._outfile + ".elf");
        } else if (toolkit.isCC65) {
            this._outdebug = path.resolve(this._builddir, this._name + ".dbg");
        }

        this._outputs = [
            this._outfile
        ];

        if (this._outdebug) {
            this._outputs.push(this._outdebug);
        }

        if (toolkit.isCpp) {
            this.#writeCompileCommands();
            this.#writeCppProperties();
        }
    }

    #load() {
        const data = this._data;
        if (!data) return;

        if (!data.name) { throw("property 'name' is missing."); }
        this._name = data.name;

        if (!data.toolkit) { throw("property 'toolkit' needs to be defined (either 'acme', 'kick', 'cc65' or 'llvm')"); }
        const toolkitId = data.toolkit.toLowerCase();

        if (["acme", "kick", "cc65", "llvm"].indexOf(toolkitId) < 0) {
            throw("property 'toolkit' needs to be either 'acme', 'kick', 'cc65' or 'llvm'");
        }

        this._toolkit = Toolkit.fromName(toolkitId);

        const toolkit = this._toolkit;

        const settings = this._settings;
        const projectDir = this.basedir;

        if (!data.main && !data.sources) { throw("properties 'sources' or 'main' are missing."); }

        const srcs = [];
        const srcFilenames = [];

        if (data.main) {
            const filename = path.resolve(this._basedir, data.main);
            srcFilenames.push(filename);
            srcs.push(new ProjectItem(filename));
        }

        if (data.sources) {
            for (const src of data.sources) {
                let filename = null;
                let isStructuredData = false;
                if (typeof src === 'string') {
                    filename = src;
                } else {
                    filename = src.path;
                    isStructuredData = true;
                }

                if (!filename) continue;

                const resolvedFilename = path.resolve(this._basedir, filename);

                if (srcFilenames.indexOf(resolvedFilename) == -1) {
                    srcFilenames.push(resolvedFilename);
                    srcs.push(new ProjectItem(resolvedFilename, isStructuredData ? src : null));
                }
            }
        }

        this._sources = srcs;

        if (toolkit.isKick) {

            const asmSources = this.querySourceByExtension(Constants.AsmFileFilter);
            if (asmSources && asmSources.length > 1) {
                logger.warn("KickAssembler does not support more than one input file. Additional assembler sources from the project file will be ignored.");
            }

        }

        this._description = data.description||"";

        this._compiler = data.compiler;
        this._assembler = data.assembler;
        this._linker = data.linker;
        this._buildType = data.build;

        { // definitions
            const definitions = [];
            if (settings.buildDefines) {
                const defs = settings.buildDefines.split(",");
                for (const def of defs) {
                    definitions.push(def.trim());
                }
            }
            if (data.definitions) {
                definitions.push(...data.definitions);
            }

            if (!this.releaseBuild) {
                definitions.push("DEBUG");
            }

            this._definitions = definitions;
        }

        { // includes
            const includes = [];

            // includes.push(path.dirname(this.main))
            includes.push(this._basedir);

            if (data.includes) {
                includes.push(...data.includes);
            }
            if (settings.buildIncludePaths) {
                const dirs = settings.buildIncludePaths.split(",").map(item => item.trim());
                includes.push(...dirs);
            }

            // resolve and store
            this._includes = []
            for (const include of includes) {
                if (path.isAbsolute(include)) {
                    this._includes.push(include);
                } else {
                    this._includes.push(path.resolve(projectDir, include));
                }
            }

        }

        { // libraries
            const libraries = [];
            if (settings.buildDefines) {
                const libs = settings.buildLibraries.split(",");
                for (const lib of libs) {
                    libraries.push(lib.trim());
                }
            }
            if (data.libraries) {
                libraries.push(...data.libraries);
            }
            this._libraries = libraries;
        }

        { // args

            const args = [];
            if (data.args) {
                args.push(...data.args);
            }

            if (settings.buildArgs) {
                args.push(... Utils.splitQuotedString(settings.buildArgs));
            }

            this._args = args;

            this._assemblerFlags = data.assemblerFlags;
            this._compilerFlags = data.compilerFlags;
            this._linkerFlags = data.linkerFlags;
        }

        { // additional settings
            this._startAddress = data.startAddress;
        }

        {
            this._resourceCompilerArgs = Arguments.fromString(data.rcFlags);
            const rcArguments = this._resourceCompilerArgs;

            let rcFormat = null;
            if (!rcArguments.hasOption("format")) {
                if (toolkit.isCC65) rcFormat = "cc";
                else if (toolkit.isLLVM) rcFormat = "cpp";
                else rcFormat = toolkit.name;
                rcArguments.setOption("format", rcFormat);
            } else {
                rcFormat = rcArguments.getOption("format");
            }

            this._resourceOutputType = "asm"; // default

            if (toolkit.isAssembler && (rcFormat == "cc" || rcFormat == "cpp")) {
                rcArguments.setOption("format", toolkit.name); // format name = toolkit name
                logger.warn("specified resource compiler output format '" + rcFormat + "' is not supported by assembler toolkits - using assembler output format instead");
            } else {
                if (rcFormat == "cc") this._resourceOutputType = "c";
                else if (rcFormat == "cpp") this._resourceOutputType = "cpp";
            }
        }

    }

    hasSources() {
        const srcs = this._sources;
        if (!srcs || srcs.length < 1) return false;
        return true;
    }

    isSource(filename) {
        if (!filename) return false;

        const normalizedFilename = Utils.normalizePath(filename);

        const srcs = this._sources;
        if (!srcs || srcs.length < 1) return false;

        for (const src of srcs) {
            const srcPath = Utils.normalizePath(src.filename);
            if (srcPath == normalizedFilename) return true;
        }

        return false;
    }

    resolveFile(filename, refdir) {

        const projectDir = this.basedir;

        if (refdir) {
            const absFilename = path.resolve(refdir, filename);
            if (absFilename && fs.existsSync(absFilename)) return absFilename;
        } else {
            const absFilename = path.resolve(filename);
            if (absFilename && fs.existsSync(absFilename)) return absFilename;
        }

        const includes = this.includes;
        for (const include of includes) {
            let absName = null;

            if (path.isAbsolute(include)) {
                absName = path.resolve(include, filename);
            } else {
                absName = path.resolve(projectDir, include, filename);
            }

            if (absName && fs.existsSync(absName)) return absName;
        }

        return null;
    }

    querySourceItemsByExtension(extensions) {
        const srcs = this.sources;
        if (!srcs || srcs.length < 1) return null;

        const result = [];

        for (const srcItem of srcs) {
            const _src_ = srcItem.filename;
            const ext = srcItem.extension;
            if (ext && extensions.indexOf('|' + ext + '|') >= 0) {
                result.push(srcItem);
            }
        }

        if (result.length < 1) return null;

        return result;
    }

    querySourceByExtension(extensions) {

        const srcItems = this.querySourceItemsByExtension(extensions);
        if (!srcItems || srcItems.length < 1) return null;

        const result = [];

        for (const srcItem of srcItems) {
            const src = srcItem.filename;
            result.push(src);
        }

        if (result.length < 1) return null;

        return result;
    }

    #writeCppProperties() {

        this.#createBuildDir();

        const settings = this._settings;
        const includes = this.includes;

        const filename = this.cpppropertiesfile;
        const filetime = Utils.getFileTime(filename);
        if (this._modificationTime && filetime >= this._modificationTime) {
            return;
        }

        let compilerPath = this.#getCompilerExecutable();
        if (this.toolkit.isCC65 || !Utils.fileExists(compilerPath)) compilerPath = "";

        const data = {
            configurations: [
                {
                    name: "C64",
                    //configurationProvider: "rosc.vs64",
                    compileCommands: "${workspaceFolder}/build/compile_commands.json",
                    compilerPath: compilerPath,
                    cppStandard: "c++20",
                    cStandard: "c99"
                }
            ],
            version: 4
        };

        if (this.toolkit.isCC65) {

            const includePath = [];

            if (settings && settings.cc65Includes) {
                settings.cc65Includes.forEach((item) => { includePath.push(item); });

            }

            if (includes) {
                includes.forEach((item) => { includePath.push(item); });
            }

            if (includePath.length > 0) {
                data.configurations[0].includePath = includePath;
            }
        }

        try {
            const parentDir = path.dirname(filename);
            Utils.createFolder(parentDir);
            const json = (JSON.stringify(data, null, 4) + "\n").replace(/\\\\/g, "/");
            fs.writeFileSync(filename, json, 'utf8');
        } catch (e) {
            logger.error("could not write cpp properties file: " + e);
        }

    }

    #writeCompileCommands() {

        this.#createBuildDir();

        const filename = this.compilecommandsfile;
        const filetime = Utils.getFileTime(filename);
        if (this._modificationTime && filetime >= this._modificationTime) {
            return;
        }

        const compileCommands = [];

        const cppSources = this.querySourceByExtension(Constants.CppFileFilter)||[];
        const includes = this.includes;
        const defines = this.definitions;

        const resourceOutputType = this._resourceOutputType;

        const resSources = this.querySourceByExtension(Constants.ResourceFileFilter);
        if (resSources && resSources.length > 0) {
            for (let resSource of resSources) {
                const cppFile = this.#getBuildPath(resSource, resourceOutputType);
                if (cppSources.indexOf(cppFile) == -1) cppSources.push(cppFile);
            }
        }

        for (const cppSource of cppSources) {
            compileCommands.push(this.#declareCompileCommand(cppSource, includes, defines));
        }

        try {
            const json = (JSON.stringify(compileCommands, null, 4) + "\n").replace(/\\\\/g, "/");
            fs.writeFileSync(filename, json, 'utf8');
        } catch (e) {
            logger.error("could not write compile commands file: " + e);
        }
    }

    #getCompilerExecutable(filename) {

        const toolkit = this.toolkit;
        const settings = this._settings;

        let compilerPath = "";
        if (toolkit.isLLVM) {
            if (this.compiler) {
                compilerPath = this.compiler;
            } else {
                if (filename) {
                    const extension = Utils.getExtension(filename);
                    if (extension == 'c') {
                        compilerPath = settings.clangcExecutable;
                    } else {
                        compilerPath = settings.clangExecutable;
                    }
                } else {
                    compilerPath = settings.clangExecutable;
                }
            }
        } else if (toolkit.isCC65) {
            compilerPath = (this.compiler || settings.cc65Executable);
        }

        return compilerPath;
    }

    #declareCompileCommand(filename, includes, defines, args) {

        const toolkit = this.toolkit;
        const settings = this._settings;
        const workingDirectory = this._basedir;

        const compilerPath = this.#getCompilerExecutable(filename);

        const command = {
            directory: workingDirectory,
            file: filename,
            arguments: [
                compilerPath
            ]
        };

        if (args) {
            command.arguments.push(...args);
        }

        if (defines) {
            for (const define of defines) {
                command.arguments.push("-D" + define);
            }
        }

        if (toolkit.isCC65) {
            command.arguments.push("-D__fastcall__=/**/");
            command.arguments.push("-D__C64__");
        }

        if (includes) {
            for (const include of includes) {
                command.arguments.push("-I" + include);
            }
        }

        let compilerIncludes = null;
        if (toolkit.isLLVM) {
            compilerIncludes = settings.llvmIncludes;
        } else if (toolkit.isCC65) {
            compilerIncludes = settings.cc65Includes;
        }

        if (compilerIncludes) {
            for (const include of compilerIncludes) {
                command.arguments.push("-I" + include);
            }
        }

        return command;
    }

    #createBuildDir() {
        if (!this.builddir) return;

        try {
            if (!fs.existsSync(this.builddir)){
                fs.mkdirSync(this.builddir);
                logger.debug("build: created project build directory");
            }
        } catch (e) {;}
    }

    #getRelativePath(absPath) {
        return path.relative(this.basedir, absPath);
    }

    #getBuildPath(sourcePath, newExtension) {

        const builddir = this.builddir;
        const basedir = this.basedir;

        if (!builddir || !basedir) return null;

        let buildPath = null;

        if (Utils.isSubfolderOf(sourcePath, builddir)) {
            buildPath = path.join(path.dirname(sourcePath), path.basename(sourcePath, path.extname(sourcePath)) + "." + newExtension);
        } else if (Utils.isSubfolderOf(sourcePath, this.basedir)) {
            const relpath = this.#getRelativePath(sourcePath);
            const reldir = path.dirname(relpath);
            buildPath = path.resolve(builddir, reldir, path.basename(sourcePath, path.extname(sourcePath)) + "." + newExtension);
        } else {
            const locationHash = Utils.md5(path.dirname(sourcePath));
            buildPath = path.resolve(builddir, "extern", locationHash, path.basename(sourcePath, path.extname(sourcePath)) + "." + newExtension);
        }

        return buildPath;
    }

    getFileReferences(filename, referenceList) {
        const project = this;
        return Scanner.scan(filename, referenceList, project);
    }

    getAsmSourceFiles(resolve) {

        // Special function to maintain sequence order of files given in project file
        // This is needed because we need the same order in the generated report file
        // ACME is not adding source file information in the report for multiple modules
        // Instead, it just generates a 0xff byte into the text file.
        // This seems to be a BUG in ACME.

        const srcs = this.sources;
        if (!srcs || srcs.length < 1) return null;

        const asmSources = [];

        for (const srcItem of srcs) {
            const src = srcItem.filename;
            const ext = srcItem.extension;
            if (!ext) continue;

            if (Constants.AsmFileFilter.indexOf('|' + ext + '|') >= 0) {
                asmSources.push(src);
            } else if (Constants.ResourceFileFilter.indexOf('|' + ext + '|') >= 0) {
                const asmFile = this.#getBuildPath(src, "asm");
                if (asmSources.indexOf(asmFile) == -1) {
                    asmSources.push(asmFile);
                }
            }
        }

        if (asmSources.length < 1) {
            return null;
        }

        if (!resolve) {
            return asmSources;
        }

        const resolvedAsmSources = [ ...asmSources ];
        for (const asmSource of asmSources) {
            this.getFileReferences(asmSource, resolvedAsmSources);
        }

        return resolvedAsmSources;

    }

    updateBuildTree() {
        this._buildTree = this.#createBuildTree();
    }

    #createBuildTree() {

        const thisInstance = this;

        const toolkit = this.toolkit;

        const doNotResolveResources = false;

        const asmFiles = TranslationList.fromList(
            (toolkit.isAcme) ?
            this.getAsmSourceFiles() : // (workaround for ACME debug report bug)
            this.querySourceByExtension(Constants.AsmFileFilter)
        );

        const resFiles = TranslationList.fromList(this.querySourceByExtension(Constants.ResourceFileFilter));
        const cppFiles = TranslationList.fromList(this.querySourceByExtension(Constants.CppFileFilter));
        const objFiles = TranslationList.fromList(this.querySourceByExtension(Constants.ObjFileFilter));
        const genFiles = TranslationList.createEmpty();
        const depFiles = TranslationList.createEmpty();

        const resourceOutputType = toolkit.isCpp ? this._resourceOutputType : "asm";

        resFiles.forEach((input) => {
            const output = this.#getBuildPath(input, resourceOutputType);
            genFiles.add(output, input, "res");
            depFiles.add(output, input, "res");

            if (!doNotResolveResources) {
                if (resourceOutputType == "asm" || toolkit.isAssembler) asmFiles.add(output, input);
                else cppFiles.add(output, input);
            }

        });

        cppFiles.forEach((input) => {
            if (toolkit.isCC65) {
                // c files get compiled to asm
                const output = this.#getBuildPath(input, "s");
                asmFiles.add(output, input, "cpp");
                depFiles.add(output, input, "asm");

                const dependencies = this.getFileReferences(input);
                depFiles.add(output, dependencies);

            } else {
                // c/c++ files get compiled to obj
                const output = this.#getBuildPath(input, "o");
                const extension = Utils.getExtension(input);
                const rule = (extension != "c") ? "cpp" : "cc";
                objFiles.add(output, input, rule);
                depFiles.add(output, input, rule);
            }
        });


        if (toolkit.isCpp) {
            // add dependency information for object files
            asmFiles.forEach((input) => {
                objFiles.add(this.#getBuildPath(input, "o"), input, "asm");
            });
        } else if (toolkit.isAcme) {
            // generate one dependency list for all compilation units
            const dependencies = asmFiles.clone();
            asmFiles.forEach((filename) => {
                this.getFileReferences(filename, dependencies);
            });
            depFiles.add(thisInstance.outfile, dependencies);
        } else if (toolkit.isKick) {
            // generate one dependency list for all compilation units
            const dependencies = [];
            let asmMain = null;
            asmFiles.forEach((filename) => {
                if (!asmMain) {
                    asmMain = filename;
                    dependencies.push(asmMain);
                }
                this.getFileReferences(filename, dependencies);
            });
            genFiles.forEach((filename) => {
                dependencies.push(filename);
            });

            depFiles.add(thisInstance.outfile, dependencies);
        }

        const buildTree = {
            res: resFiles,  // resource files
            gen: genFiles,  // generated resource files (all)
            cpp: cppFiles,  // cpp files
            asm: asmFiles,  // asm files
            obj: objFiles,  // obj files (llvm and cc65)
            deps: depFiles  // dependencies (kick)
        }

        return buildTree;
    }

    createBuildFile(forcedOverwrite) {

        const settings = this._settings;

        const project = this;
        const toolkit = project.toolkit;
        const releaseBuild = project.releaseBuild;

        this.#createBuildDir();

        this.updateBuildTree();

        const buildFile = this.buildfile;

        if (!forcedOverwrite) {
            let modificationTime = Utils.getFileTime(buildFile);
            if (modificationTime && modificationTime >= project.modificationTime) {
                // already up-to-date
                return;
            }
        }

        const buildTree = this.buildTree;
        const defines = new ArgumentList(project.definitions);
        const includes = new NinjaArgs(project.includes, project.builddir);

        const script = [];

        { // header information
            script.push("################################################################################");
            script.push("# BUILD FILE");
            script.push("# generated file: DO NOT EDIT!");
            script.push("################################################################################");
            script.push("");

            script.push("ninja_required_version = 1.3");
            script.push(Ninja.keyValue("toolkit", toolkit.name));
            script.push(Ninja.keyValue("builddir", project.builddir));
            script.push("");

            script.push(Ninja.keyValue("project", project.name));
            script.push(Ninja.keyValue("config", project.configfile));
            script.push(Ninja.keyValue("target", project.outfile));
            script.push(Ninja.keyValue("dbg_out", project.outdebug));

            if (settings.pythonExecutable) {
                script.push(Ninja.keyValue("python_exe", settings.pythonExecutable));
            }

            if (settings.javaExecutable) {
                script.push(Ninja.keyValue("java_exe", settings.javaExecutable));
            }

            script.push(Ninja.keyValue("rc_exe", settings.resourceCompiler));

            // resource compiler flags
            const rcArguments = project._resourceCompilerArgs
            let rcFlags = new NinjaArgs(rcArguments.argv);
            if (!rcArguments.hasOption("config")) {
                rcFlags.add("--config", "\"$config\"");
            }
            script.push(Ninja.keyArgs("rc_flags", rcFlags));
        }

        if (toolkit.isKick) {

            script.push(Ninja.keyValue("asm_exe", (project.assembler || settings.kickExecutable)));
            script.push(Ninja.keyValue("asminfo", path.resolve(project.builddir, project.name + ".info")));
            script.push("");

            const flags = new NinjaArgs(
                "-debugdump",
                "-asminfo",
                "\"files|errors\""
            );

            if (!releaseBuild) {
                defines.add("DEBUG");
                flags.add("-debug");
            }

            flags.add(
                this._args,
                this._assemblerFlags
            );

            script.push(Ninja.keyArgs("flags", flags));
            script.push(Ninja.keyValueRaw("includes", includes.join("-libdir ")));
            script.push(Ninja.keyValueRaw("defs", defines.join("-define ")));

            script.push("");

            script.push("rule res");
            script.push("    command = $python_exe $rc_exe $rc_flags -o $out $in");
            script.push("");

            script.push("rule asm");
            script.push("    depfile = $out.d");
            script.push("    deps = gcc");
            script.push("    command = $java_exe -jar $asm_exe -odir \"$builddir\" -asminfofile \"$asminfo\" $flags $includes -o $out $in");
            script.push("");

            buildTree.gen.forEach((to, from) => {
                script.push(Ninja.build(to, from, "res"));
            });
            script.push("");

            const pgmDeps = buildTree.deps.getAsArray(project.outfile);
            const asmMain = pgmDeps[0]||"main.asm";
            const pgmRefs = pgmDeps.slice(1);

            let asmBuild = "build $target | $dbg_out : asm " + Ninja.escape(asmMain);

            if (!buildTree.deps.empty()) {
                asmBuild += " | " + Ninja.join(pgmRefs);
            }

            script.push(asmBuild);
            script.push("");

        } else if (toolkit.isAcme) {

            script.push(Ninja.keyValue("asm_exe", (project.assembler || settings.acmeExecutable)));
            script.push("");

            const flags = new NinjaArgs(
                "--msvc",
                "--maxerrors", "99"
            );

            if (!releaseBuild) {
                flags.add("-DDEBUG=1");
            }

            flags.add(this._args);
            flags.add(this._assemblerFlags);

            if (flags.indexOf("-f") == -1) flags.add("-f", "cbm");
            if (flags.indexOf("--cpu") == -1) flags.add("--cpu", "6510");

            script.push(Ninja.keyArgs("flags", flags));
            script.push(Ninja.keyValueRaw("includes", includes.join("-I ")));
            script.push("");

            script.push("rule res");
            script.push("    command = $python_exe $rc_exe $rc_flags -o $out $in");
            script.push("");

            script.push("rule asm");
            script.push("    depfile = $out.d");
            script.push("    deps = gcc");
            script.push("    command = $asm_exe $flags $includes -r \"$dbg_out\" -o $out $in");
            script.push("");

            buildTree.gen.forEach((to, from) => {
                script.push(Ninja.build(to, from, "res"));
            });
            script.push("");

            script.push("build $target | $dbg_out : asm " + Ninja.join(buildTree.asm.array()))
            script.push("");

        } else if (toolkit.isCC65) {

            const flags = new NinjaArgs();
            const c_flags = new NinjaArgs();
            const asm_flags = new NinjaArgs();

            flags.add("-g");

            if (releaseBuild) {
                c_flags.add("-O", "-Oirs");
            }

            flags.add(this._args);
            asm_flags.add(this._assemblerFlags);
            c_flags.add(this._compilerFlags);

            const ln_flags = new NinjaArgs();
            if (project.startAddress) ln_flags.add("-S", project.startAddress);
            ln_flags.add(this._linkerFlags);

            // default target
            const defaultTargetConf = ["-t", "c64"];
            if (flags.indexOf("-t ") == -1 && ln_flags.indexOf("-C ") == -1 && ln_flags.indexOf("-t ") == -1) ln_flags.add(defaultTargetConf);
            if (flags.indexOf("-t ") == -1 && c_flags.indexOf("-t ") == -1) c_flags.add(defaultTargetConf);
            if (flags.indexOf("-t ") == -1 && asm_flags.indexOf("-t ") == -1) asm_flags.add(defaultTargetConf);

            script.push(Ninja.keyValue("cc_exe", (project.compiler || settings.cc65Executable)));
            script.push(Ninja.keyValue("asm_exe", (project.assembler || settings.ca65Executable)));
            script.push(Ninja.keyValue("ln_exe", (project.linker || settings.ld65Executable)));
            script.push("");

            script.push(Ninja.keyArgs("flags", flags));
            script.push(Ninja.keyArgs("asm_flags", asm_flags));
            script.push(Ninja.keyArgs("c_flags", c_flags));
            script.push(Ninja.keyArgs("ln_flags", ln_flags));
            script.push(Ninja.keyValueRaw("includes", includes.join("-I ")));
            script.push(Ninja.keyValueRaw("defs", defines.join("-D")));
            script.push(Ninja.keyValue("libs", "c64.lib"));
            script.push("");

            script.push("rule res");
            script.push("    command = $python_exe $rc_exe $rc_flags -o $out $in");
            script.push("");

            script.push("rule cc");
            script.push("    depfile = $out.d");
            script.push("    deps = gcc");
            script.push("    command = $cc_exe -o $out $flags $c_flags $includes $in");
            script.push("");

            script.push("rule asm");
            script.push("    depfile = $out.d");
            script.push("    deps = gcc");
            script.push("    command = $asm_exe -o $out $flags $asm_flags $includes $in");
            script.push("");

            script.push("rule link");
            script.push("    command = $ln_exe -o $out --dbgfile \"$dbg_out\" $ln_flags $in $libs");
            script.push("");

            buildTree.gen.forEach((to, from) => {
                script.push(Ninja.build(to, from, "res"));
            });
            script.push("");

            buildTree.asm.forEach((to, from) => {
                if (from) script.push(Ninja.build(to, from, "cc"));
            });
            script.push("");

            buildTree.obj.forEach((to, from) => {
                script.push(Ninja.build(to, from, "asm"));
            });
            script.push("");

            script.push("build $target | $dbg_out : link " + Ninja.join(buildTree.obj.array()));
            script.push("");

        } else if (toolkit.isLLVM) {

            const defaultFlags = [
                "-Wall", "-g",
                "-c",
                "-fnonreentrant"
                // "-fcrash-diagnostics-dir=" + project.builddir + -fcrash-diagnostics=all"
            ];

            if (releaseBuild) {
                defaultFlags.push("-Os", "-flto");
                //defaultFlags.push("-Ofast");
            } else {
                defaultFlags.push("-O0");
            }

            const defaultCFlags = [
                "-fno-limit-debug-info", "-fstandalone-debug", "-fno-discard-value-names"
            ];

            let flags = new NinjaArgs(this._args);
            let c_flags = new NinjaArgs(defaultFlags, defaultCFlags);
            let asm_flags = new NinjaArgs(defaultFlags, "-x", "assembler-with-cpp");
            let cpp_flags = new NinjaArgs("-std=gnu++20");
            let ld_flags = new NinjaArgs();

            asm_flags.add(this._assemblerFlags);
            c_flags.add(this._compilerFlags);
            cpp_flags.add(this._compilerFlags);
            ld_flags.add(this._linkerFlags);

            const defaultTargetConf = ["--config", "mos-c64.cfg"];
            if (flags.indexOf("--config ") == -1 && asm_flags.indexOf("--config ") == -1) asm_flags.add(defaultTargetConf);
            if (flags.indexOf("--config ") == -1 && c_flags.indexOf("--config ") == -1) c_flags.add(defaultTargetConf);
            if (flags.indexOf("--config ") == -1 && ld_flags.indexOf("--config ") == -1) ld_flags.add(defaultTargetConf);

            script.push(Ninja.keyValue("clang", (project.compiler || settings.clangExecutable)));
            script.push(Ninja.keyValue("clangc", (project.compiler || settings.clangcExecutable)));
            script.push("");

            script.push(Ninja.keyArgs("flags", flags));
            script.push(Ninja.keyArgs("asmflags", asm_flags));
            script.push(Ninja.keyArgs("cflags", c_flags));
            script.push(Ninja.keyArgs("cppflags", cpp_flags));
            script.push(Ninja.keyArgs("ldflags", ld_flags));
            script.push(Ninja.keyValueRaw("includes", includes.join("-I ")));
            script.push(Ninja.keyValueRaw("defs", defines.join("-D")));
            script.push("");

            script.push("rule res");
            script.push("    command = $python_exe $rc_exe $rc_flags -o $out $in");
            script.push("");

            script.push("rule cpp");
            script.push("    depfile = $out.d");
            script.push("    deps = gcc");
            script.push("    command = $clang -MD -MF $out.d $flags $cppflags $cflags $defs $includes -o $out $in");
            script.push("");

            script.push("rule cc");
            script.push("    depfile = $out.d");
            script.push("    deps = gcc");
            script.push("    command = $clangc -MD -MF $out.d $flags $cflags $defs $includes -o $out $in");
            script.push("");

            script.push("rule asm");
            script.push("    depfile = $out.d");
            script.push("    deps = gcc");
            script.push("    command = $clang $flags $asmflags $includes -o $out $in");
            script.push("");

            script.push("rule link");
            script.push("    command = $clang $flags $ldflags -O0 -o $out $in");
            script.push("");

            buildTree.gen.forEach((to, from) => {
                script.push(Ninja.build(to, from, "res"));
            });
            script.push("");

            buildTree.obj.forEach((to, from, rule) => {
                script.push(Ninja.build(to, from, (rule || "cpp")));
            });
            script.push("");

            script.push("build $target | $dbg_out : link " + Ninja.join(buildTree.obj.array()));
            script.push("");

        }

        script.push("build all: phony $target");
        script.push("default all");
        script.push("");

        {
            // write build file

            const fileData = script.join("\n");
            try {
                fs.writeFileSync(buildFile, fileData, "utf8");
            } catch (err) {
                console.log("failed to write build file: " + err);
            }
        }
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Project: Project
}
