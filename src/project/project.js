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

const { Utils } = require('utilities/utils');
const { Logger } = require('utilities/logger');
const { Constants } = require('settings/settings');

const logger = new Logger("Project");

const WHITESPACE_CHARS = " \t\r\n\v";

function isWhitespace(c) {
    return (WHITESPACE_CHARS.indexOf(c) >= 0);
}

const TokenType = {
    None: 0,
    Include: 1
};

const TokenValueType = {
    None: 0,
    Filename: 1
};

const TokenDescriptors = {
    "!src": { tokenType: TokenType.Include,valueType: TokenValueType.Filename },
    "!source": { tokenType: TokenType.Include,valueType: TokenValueType.Filename },
    "#include": { tokenType: TokenType.Include,valueType: TokenValueType.Filename },
    "#import": { tokenType: TokenType.Include,valueType: TokenValueType.Filename }
};

class Token {
    constructor(descriptor, value, lineNumber) {
        this._descriptor = descriptor;
        this._type = descriptor.tokenType;
        this._valueType = descriptor.valueType;
        this._value = this.parseValue(value);
        this._lineNumber = lineNumber;
    }

    parseValue(value) {
        return value;
    }

    get descriptor() { return this._descriptor; }
    get type() { return this._type; }
    get value() { return this._value; }
    get line() { return this._lineNumber; }
}

class ProjectItem {
    constructor(filename, attributes) {
        this._filename = filename;
        let ext = path.extname(filename) || ""
        if (ext && ext[0] == '.') ext = ext.substring(1);
        this._extension = ext.toLowerCase();
        this._args = null;
        this.setArgs(attributes);
    }

    get filename() { return this._filename; }
    get extension() { return this._extension; }

    setArgs(attributes) {
        if (!attributes) return;

        let args = "";

        for (const key of Object.keys(attributes)) {
            if (key == "path") continue;
            const value = attributes[key];
            const s = "--" + key + "=" + value;
            if (args.length > 0) args += " ";
            args += s;
        }

        if (args.length < 1) return;

        this._args = args;
    }

    hasArgs() {
        return (this._args != null);
    }

    getArgs() {
        return this._args;
    }
}

class Project {
    constructor(settings) {
        this._error = null;
        this._settings = settings;
        this._modificationTime = null;
        this._outputs = null;
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
    get resourceCompilerArgs() { return this._resourceCompilerArgs; }
    get buildfile() { return this._buildfile; }
    get modificationTime() { return this._modificationTime; }
    get outputs() { return this._outputs; }
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

        this._basedir = path.dirname(this._configfile);
        this._builddir = path.resolve(this._basedir, "build");
        this._buildfile = path.resolve(this._builddir, "build.ninja");
        this._compilecommandsfile = path.resolve(this._builddir, "compile_commands.json");
        this._cpppropertiesfile = path.resolve(this._basedir, ".vscode", "c_cpp_properties.json");

        this.#load();

        this._outname = this._name + ".prg";
        this._outfile = path.resolve(this._builddir, this._outname);

        const toolkit = this._toolkit;

        if (toolkit == "acme") {
            this._outdebug = path.resolve(this._builddir, this._name + ".report");
        } else if (toolkit == "kick") {
            this._outdebug = path.resolve(this._builddir, this._name + ".dbg");
        } else if (toolkit == "llvm") {
            this._outdebug = path.resolve(this._builddir, this._outfile + ".elf");
        } else if (toolkit == "cc65") {
            this._outdebug = path.resolve(this._builddir, this._name + ".dbg");
        }

        this._outputs = [
            this._outfile
        ];

        if (this._outdebug) {
            this._outputs.push(this._outdebug);
        }

        if (toolkit == "cc65" || toolkit == "llvm") {
            this.#writeCompileCommands();
            this.#writeCppProperties();
        }
    }

    #load() {
        const data = this._data;
        if (!data) return;

        if (!data.name) { throw("property 'name' is missing."); }
        this._name = data.name;

        if (!data.toolkit) { throw("property 'toolkit' needs to be defined (either 'acme' or 'cc65')"); }
        this._toolkit = data.toolkit.toLowerCase();

        if (["acme", "kick", "cc65", "llvm"].indexOf(this._toolkit) < 0) {
            throw("property 'toolkit' needs to be either 'acme', 'kick', 'cc65' or 'llvm'");
        }

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

        if (this._toolkit == "kick") {

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
        this._resourceCompilerArgs = data.rcFlags;

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

    #getReferences(filename, referenceList) {

        if (!referenceList) {
            referenceList = [];
        }

        logger.debug("scanFile: " + filename);

        const dirname = path.dirname(filename);

        let source = null;

        try {
            source = fs.readFileSync(filename, 'utf8');
        } catch(err) {
            return referenceList;
        }

        const tokens = this.#parse(source, filename);

        if (tokens) {
            for (const token of tokens) {
                if (token.type == TokenType.Include) {
                    const ref = this.resolveFile(token.value, dirname);
                    if (ref) {
                        if (referenceList.indexOf(ref) == -1) {
                            referenceList.push(ref);
                            this.#getReferences(ref, referenceList);
                        }
                    }
                }
            }
        }

        return referenceList;
    }

    #parse(source, filename) {

        if (!source) return null;

        let lineNumber = 0;
        let colNumber = 0;

        let pos = 0;
        let endpos = source.length;

        let line = "";

        let tokens = [];

        while (pos < endpos) {

            const c = source[pos];
            pos++;

            if (c == '\r' || c == '\n' || pos == endpos) {
                if (c == '\r' && pos < endpos) {
                    if (source[pos] == '\n') pos++;
                }

                const token = this.#parseLine(line, lineNumber);
                if (token) {
                    tokens.push(token);
                }

                line = "";
                lineNumber++;
                colNumber = 0;
                continue;
            }

            line += c;
            colNumber++;

        }

        return tokens;

    }

    #parseLine(source, lineNumber) {
        if (!source || source.length < 1) return null;

        let pos = 0;
        let endpos = source.length;

        while (pos < endpos && isWhitespace(source[pos])) { pos++; }

        if (pos == endpos) return null;

        const firstChar = source[pos];

        // just scan for special tokens
        if (firstChar != '!' && firstChar != '#') return null;

        if (source.startsWith("!if", pos)) {
            pos += 3;
            while (pos < endpos && source[pos] != '!') {
                pos++;
            }

            if (pos == endpos) return null;
        }

        let token = null;

        for (const tokenName of Object.keys(TokenDescriptors)) {
            const tokenDescriptor = TokenDescriptors[tokenName];

            if (source.startsWith(tokenName, pos)) {
                pos += tokenName.length;

                while (pos < endpos && isWhitespace(source[pos])) { pos++; }
                if (pos == endpos) break;

                const startChar = source.charAt(pos);
                if (startChar != '\"' && startChar != '\'' && startChar != '<') break;

                pos++;
                const startPos = pos;

                let escaped = false;
                while (pos < endpos) {
                    const c = source.charAt(pos);
                    if (escaped) {
                        escaped = false;
                    } else {
                        if (c == '>') {
                            if (startChar == '<') break;
                        } else if (c == startChar) {
                            break;
                        } else if (c == '\\') {
                            escaped = true;
                        }
                    }
                    pos++;
                }

                let value = source.substring(startPos, pos).trim();

                if (value.length > 0) {
                    token = new Token(tokenDescriptor, value, lineNumber);
                }

                break;
            }
        }

        return token;
    }

    querySourceItemsByExtension(extensions) {
        const srcs = this.sources;
        if (!srcs || srcs.length < 1) return null;

        const result = [];

        for (const srcItem of srcs) {
            const src = srcItem.filename;
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

    #join(elements, prefix, separator, do_escape) {
        if (!elements || elements.length < 1) return "";

        let s = "";
        if (!separator) separator = " ";

        for (let i=0; i<elements.length; i++) {
            const element = elements[i];
            if (i>0 && separator) s += separator;
            if (prefix) s += prefix;
            s += (do_escape ? this.#escape(element) : element);
        }

        return s;
    }

    #keyValue(key, value) {
        return key + " = " + value;
    }

    #escape(s) {

        if (!s) return s;

        let esc = "";

        for (const c of s) {
            if (c == ':') esc += "$:"
            else if (c == ' ') esc += "$ "
            else if (c == '$') esc += "$$"
            else esc += c;
        }

        return esc;
    }

    #createDependencyFile(filename, target, dependencies) {

        let s = "";

        s += target + ":";

        if (dependencies && dependencies.length > 0) {
            for (let i=0; i<dependencies.length; i++) {
                s += " \\\n";
                s += "  " + dependencies[i];
            }
        }

        s += '\n';

        try {
            fs.writeFileSync(filename, s, "utf8");
        } catch (err) {
            console.log("failed to write dependency file: " + err);
        }

    }

    #writeCppProperties() {

        this.#createBuildDir();

        const filename = this.cpppropertiesfile;
        const filetime = Utils.getFileTime(filename);
        if (filetime >= this._modificationTime) {
            return;
        }

        let compilerPath = this.#getCompilerExecutable();
        if (!Utils.fileExists(compilerPath)) compilerPath = "";

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
        if (filetime >= this._modificationTime) {
            return;
        }

        const compileCommands = [];

        const cppSources = this.querySourceByExtension(Constants.CppFileFilter)||[];
        const includes = this.includes;
        const defines = this.definitions;

        const resSources = this.querySourceByExtension(Constants.ResourceFileFilter);
        if (resSources && resSources.length > 0) {
            for (let resSource of resSources) {
                const cppFile = this.#getBuildPath(resSource, "cpp");
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

    #getCompilerExecutable() {

        const toolkit = this.toolkit;
        const settings = this._settings;

        let compilerPath = "";
        if (toolkit == "llvm") {
            compilerPath = (this.compiler || settings.clangExecutable);
        } else if (toolkit == "cc65") {
            compilerPath = (this.compiler || settings.cc65Executable);
        }

        return compilerPath;
    }

    #declareCompileCommand(filename, includes, defines, args) {

        const toolkit = this.toolkit;
        const settings = this._settings;
        const workingDirectory = process.cwd();

        const compilerPath = this.#getCompilerExecutable();

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

        if (toolkit == "cc65") {
            command.arguments.push("-D__fastcall__=/**/");
            command.arguments.push("-D__C64__");
        }

        if (includes) {
            for (const include of includes) {
                command.arguments.push("-I" + include);
            }
        }

        let compilerIncludes = null;
        if (toolkit == "llvm") {
            compilerIncludes = settings.llvmIncludes;
        } else if (toolkit == "cc65") {
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

    getAsmSourceFiles() {

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

        if (asmSources.length < 1) return null;

        return asmSources;

    }

    queryAllAsmFiles() {

        const project = this;
        const resSources = project.querySourceByExtension(Constants.ResourceFileFilter);
        const asmSources = project.querySourceByExtension(Constants.AsmFileFilter)||[];

        if (resSources && resSources.length > 0) {
            for (let resSource of resSources) {
                const asmFile = this.#getBuildPath(resSource, "asm");
                if (asmSources.indexOf(asmFile) == -1) {
                    asmSources.push(asmFile);
                }
            }
        }

        const queryResult = [ ...asmSources ];
        for (const asmSource of asmSources) {
            this.#getReferences(asmSource, queryResult);
        }

        return queryResult;
    }

    createBuildFile() {

        const project = this;
        const settings = this._settings;
        const toolkit = project.toolkit;

        const releaseBuild = this.releaseBuild;

        this.#createBuildDir();

        const buildFile = this.buildfile;

        let buildFileDirty = true;

        let modificationTime = Utils.getFileTime(buildFile);
        if (modificationTime && modificationTime >= project.modificationTime) {
            // already up-to-date
            buildFileDirty = false;

            if (toolkit == "llvm") {
                // early exit as for llvm, there is no need
                // to manually create depencency files for ninja
                return;
            }
        }

        const defines = [];

        if (project.definitions) {
            defines.push(...project.definitions);
        }

        const script = [];

        { // header information
            script.push("################################################################################");
            script.push("# BUILD FILE");
            script.push("# generated file: DO NOT EDIT!");
            script.push("################################################################################");
            script.push("");

            script.push("ninja_required_version = 1.3");
            script.push(this.#keyValue("builddir", project.builddir));
            script.push("");

            script.push(this.#keyValue("project", project.name));
            script.push(this.#keyValue("config", project.configfile));
            script.push(this.#keyValue("target", project.outfile));
            script.push(this.#keyValue("dbg_out", project.outdebug));

            if (settings.pythonExecutable) {
                script.push(this.#keyValue("python_exe", settings.pythonExecutable));
            }

            if (settings.javaExecutable) {
                script.push(this.#keyValue("java_exe", settings.javaExecutable));
            }

            const extensionPath = settings.extensionPath;
            script.push(this.#keyValue("rc_exe", settings.resourceCompiler));

            let rcFlags = project.resourceCompilerArgs || "";

            if (rcFlags.length > 0) rcFlags += " ";
            rcFlags += "--config $config";

            if (rcFlags.indexOf("--format ") == -1) {
                let rcFormat = toolkit;
                if (toolkit == "cc65") rcFormat = "cc";
                else if (toolkit == "llvm") rcFormat = "cpp";
                rcFlags += " --format " + rcFormat;
            }
            script.push(this.#keyValue("rc_flags", rcFlags));
        }

        if (toolkit == "kick") {

            const resSources = project.querySourceByExtension(Constants.ResourceFileFilter);

            script.push(this.#keyValue("asm_exe", (project.assembler || settings.kickExecutable)));
            script.push("");

            let flags = "-debugdump";

            flags += " -asminfo \"files|errors\" -asminfofile " + path.resolve(project.builddir, project.name + ".info");

            if (!releaseBuild) {
                defines.push("DEBUG");
                flags += " -debug";
            }

            flags += " -odir " + project.builddir;

            if (this._args && this._args.length > 0) flags += " " + this._args.join(" ");
            if (this._assemblerFlags) flags += " " + this._assemblerFlags;

            script.push(this.#keyValue("flags", flags.trim()));

            let includes = this.#join(project.includes, "-libdir ");
            includes += (includes.length > 0 ? " " : "") + "-libdir " + project.builddir;

            script.push(this.#keyValue("includes", includes));

            let defs = "";
            if (defines && defines.length > 0) {
                defs += this.#join(defines, "-define ");
            }

            script.push(this.#keyValue("defs", defs));

            script.push("");

            script.push("rule res");
            script.push("    command = $python_exe $rc_exe $rc_flags -o $out $in");
            script.push("");

            script.push("rule asm");
            script.push("    depfile = $out.d");
            script.push("    deps = gcc");
            script.push("    command = $java_exe -jar $asm_exe $flags $includes -o $out $in");
            script.push("");

            const generatedAsmSources = [];

            if (resSources && resSources.length > 0) {
                for (let resSource of resSources) {
                    const asmFile = this.#getBuildPath(resSource, "asm");
                    if (generatedAsmSources.indexOf(asmFile) == -1) {
                        generatedAsmSources.push(asmFile);
                    }
                    script.push("build " + this.#escape(asmFile) + ": res " + this.#escape(resSource));
                }
                script.push("");
            }

            const asmSources = project.querySourceByExtension(Constants.AsmFileFilter)||[];

            const dependencies = [ ...asmSources ];
            for (const asmSource of asmSources) {
                this.#getReferences(asmSource, dependencies);
            }
            this.#createDependencyFile(project.outfile + ".d", project.outfile, dependencies);

            let asmBuild = "build $target | $dbg_out : asm " + this.#join(asmSources, null, null, true);
            if (generatedAsmSources.length > 0) {
                asmBuild += " | " + this.#join(generatedAsmSources, null, null, true);
            }

            script.push(asmBuild);

        } else if (toolkit == "acme") {

            const resSources = project.querySourceByExtension(Constants.ResourceFileFilter);

            script.push(this.#keyValue("asm_exe", (project.assembler || settings.acmeExecutable)));
            script.push("");

            let flags = "--msvc --maxerrors 99 ";

            if (!releaseBuild) {
                flags += " -DDEBUG=1";
            }

            flags += " -r $dbg_out";

            if (this._args && this._args.length > 0) flags += " " + this._args.join(" ");
            if (this._assemblerFlags) flags += " " + this._assemblerFlags;

            if (flags.indexOf("-f") == -1) flags += " -f cbm";
            if (flags.indexOf("--cpu") == -1) flags += " --cpu 6510";

            script.push(this.#keyValue("flags", flags.trim()));
            script.push(this.#keyValue("includes", this.#join(project.includes, "-I ")));
            script.push("");

            script.push("rule res");
            script.push("    command = $python_exe $rc_exe $rc_flags -o $out $in");
            script.push("");

            script.push("rule asm");
            script.push("    depfile = $out.d");
            script.push("    deps = gcc");
            script.push("    command = $asm_exe $flags $includes -o $out $in");
            script.push("");

            if (resSources && resSources.length > 0) {
                for (let resSource of resSources) {
                    const asmFile = this.#getBuildPath(resSource, "asm");
                    script.push("build " + this.#escape(asmFile) + ": res " + this.#escape(resSource));
                }
                script.push("");
            }

            //const asmSources = project.querySourceByExtension(Constants.AsmFileFilter)||[];

            // Special function to maintain sequence order of files given in project file
            // This is needed because we need the same order in the generated report file
            // ACME is not adding source file information in the report for multiple modules
            // Instead, it just generates a 0xff byte into the text file.
            // This seems to be a BUG in ACME.
            const asmSources = project.getAsmSourceFiles();

            const dependencies = [ ...asmSources ];
            for (const asmSource of asmSources) {
                this.#getReferences(asmSource, dependencies);
            }
            this.#createDependencyFile(project.outfile + ".d", project.outfile, dependencies);

            script.push("build $target | $dbg_out : asm " + this.#join(asmSources, null, null, true))

        } else if (toolkit == "cc65") {

            const resSources = project.querySourceByExtension(Constants.ResourceFileFilter);
            const cppSources = project.querySourceByExtension(Constants.CppFileFilter)||[];
            const asmSources = project.querySourceByExtension(Constants.AsmFileFilter)||[];
            const objFiles = project.querySourceByExtension(Constants.ObjFileFilter)||[];

            let flags = "-g";
            let c_flags = "";
            let asm_flags = "";

            if (releaseBuild) {
                c_flags += "-O -Oirs";
            }

            if (this._args && this._args.length > 0) flags += " " + this._args.join(" ");
            if (this._assemblerFlags) asm_flags += " " + this._assemblerFlags;
            if (this._compilerFlags) c_flags += " " + this._compilerFlags;

            let ln_flags = "--dbgfile $dbg_out";
            if (project.startAddress) {
                ln_flags += " -S" + project.startAddress;
            }

            if (this._linkerFlags) ln_flags += " " + this._linkerFlags;

            // default target
            const defaultTargetConf = "-t c64";
            if (flags.indexOf("-t ") == -1 && ln_flags.indexOf("-C ") == -1 && ln_flags.indexOf("-t ") == -1) ln_flags += " " + defaultTargetConf;
            if (flags.indexOf("-t ") == -1 && c_flags.indexOf("-t ") == -1) c_flags += " " + defaultTargetConf;
            if (flags.indexOf("-t ") == -1 && asm_flags.indexOf("-t ") == -1) asm_flags += " " + defaultTargetConf;

            let defs = "";
            if (defines && defines.length > 0) {
                defs += this.#join(defines, "-D");
            }

            script.push(this.#keyValue("cc_exe", (project.compiler || settings.cc65Executable)));
            script.push(this.#keyValue("asm_exe", (project.assembler || settings.ca65Executable)));
            script.push(this.#keyValue("ln_exe", (project.linker || settings.ld65Executable)));
            script.push("");

            script.push(this.#keyValue("flags", flags.trim()));
            script.push(this.#keyValue("asm_flags", asm_flags.trim()));
            script.push(this.#keyValue("c_flags", c_flags.trim()));
            script.push(this.#keyValue("ln_flags", ln_flags.trim()));
            script.push(this.#keyValue("includes", this.#join(project.includes, "-I ")));
            script.push(this.#keyValue("defs", defs));
            script.push(this.#keyValue("libs", "c64.lib"));
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
            script.push("    command = $ln_exe -o $out $ln_flags $in $libs");
            script.push("");

            if (resSources && resSources.length > 0) {
                for (let resSource of resSources) {
                    const cFile = this.#getBuildPath(resSource, "c");
                    if (cppSources.indexOf(cFile) == -1) {
                        cppSources.push(cFile);
                    }
                    script.push("build " + this.#escape(cFile) + ": res " + this.#escape(resSource));
                }
                script.push("");
            }

            if (cppSources && cppSources.length > 0) {
                for (let cppSource of cppSources) {

                    const asmSource = this.#getBuildPath(cppSource, "s");
                    if (asmSources.indexOf(asmSource) == -1) {
                        asmSources.push(asmSource);
                    }

                    script.push("build " + this.#escape(asmSource) + ": cc " + this.#escape(cppSource));
                    this.#createDependencyFile(asmSource + ".d", asmSource, [ cppSource, ...this.#getReferences(cppSource) ]);
                }
                script.push("");
            }

            if (asmSources && asmSources.length > 0) {
                for (const asmSource of asmSources) {
                    const objFile = this.#getBuildPath(asmSource, "o");
                    if (objFiles.indexOf(objFile) == -1) {
                        objFiles.push(objFile);
                    }
                    script.push("build " + this.#escape(objFile) + ": asm " + this.#escape(asmSource));
                    this.#createDependencyFile(objFile + ".d", objFile, [ asmSource, ...this.#getReferences(asmSource) ]);
                }
                script.push("");
            }

            if (objFiles && objFiles.length > 0) {
                script.push("build $target | $dbg_out : link " + this.#join(objFiles, null, null, true));
            }

        } else if (toolkit == "llvm") {
            const resSources = project.querySourceByExtension(Constants.ResourceFileFilter);
            const cppSources = project.querySourceByExtension(Constants.CppFileFilter)||[];
            const asmSources = project.querySourceByExtension(Constants.AsmFileFilter)||[];
            const objFiles = project.querySourceByExtension(Constants.ObjFileFilter)||[];

            const defaultTargetConf = "--config mos-c64.cfg";
            let defaultFlags = "-Wall -std=gnu++20 -g -fstandalone-debug -fno-limit-debug-info -fno-discard-value-names -c";
            // defaultFlags += "-fcrash-diagnostics-dir=" + project.builddir + -fcrash-diagnostics=all";

            if (releaseBuild) {
                defaultFlags += " -Ofast";
            } else {
                defaultFlags += " -O0";
            }

            let defs = "";
            if (defines && defines.length > 0) {
                defs += this.#join(defines, "-D");
            }

            let flags = "";
            let asm_flags = defaultFlags + " -x assembler-with-cpp";
            let c_flags = defaultFlags;
            let ld_flags = "";

            if (this._args && this._args.length > 0) flags += " " + this._args.join(" ");
            if (this._assemblerFlags) asm_flags += " " + this._assemblerFlags;
            if (this._compilerFlags) c_flags += " " + this._compilerFlags;
            if (this._linkerFlags) ld_flags += " " + this._linkerFlags;

            if (flags.indexOf("--config ") == -1 && asm_flags.indexOf("--config ") == -1) asm_flags += " " + defaultTargetConf;
            if (flags.indexOf("--config ") == -1 && c_flags.indexOf("--config ") == -1) c_flags += " " + defaultTargetConf;
            if (flags.indexOf("--config ") == -1 && ld_flags.indexOf("--config ") == -1) ld_flags += " " + defaultTargetConf;

            script.push(this.#keyValue("clang", (project.compiler || settings.clangExecutable)));
            script.push("");

            script.push(this.#keyValue("flags", flags.trim()));
            script.push(this.#keyValue("asmflags", asm_flags.trim()));
            script.push(this.#keyValue("cflags", c_flags.trim()));
            script.push(this.#keyValue("ldflags", ld_flags.trim()));
            script.push(this.#keyValue("includes", this.#join(project.includes, "-I ")));
            script.push(this.#keyValue("defs", defs));
            script.push("");

            script.push("rule res");
            script.push("    command = $python_exe $rc_exe $rc_flags -o $out $in");
            script.push("");

            script.push("rule cc");
            script.push("    depfile = $out.d");
            script.push("    deps = gcc");
            script.push("    command = $clang -MD -MF $out.d $flags $cflags $defs $includes -o $out $in");
            script.push("");

            script.push("rule asm");
            script.push("    depfile = $out.d");
            script.push("    deps = gcc");
            script.push("    command = $clang -MD -MF $out.d $flags $asmflags $defs $includes -o $out $in");
            script.push("");

            script.push("rule link");
            script.push("    command = $clang $flags $ldflags -O0 -o $out $in");
            script.push("");

            if (resSources && resSources.length > 0) {
                for (let resSource of resSources) {
                    const cppFile = this.#getBuildPath(resSource, "cpp");
                    if (cppSources.indexOf(cppFile) == -1) {
                        cppSources.push(cppFile);
                    }
                    script.push("build " + this.#escape(cppFile) + ": res " + this.#escape(resSource));
                }
                script.push("");
            }

            if (cppSources && cppSources.length > 0) {
                for (let cppSource of cppSources) {
                    const objFile = this.#getBuildPath(cppSource, "o");
                    if (objFiles.indexOf(objFile) == -1) {
                        objFiles.push(objFile);
                    }
                    script.push("build " + this.#escape(objFile) + ": cc " + this.#escape(cppSource));
                }
                script.push("");
            }

            if (asmSources && asmSources.length > 0) {
                    for (const asmSource of asmSources) {
                    const objFile = this.#getBuildPath(asmSource, "o");
                    if (objFiles.indexOf(objFile) == -1) {
                        objFiles.push(objFile);
                    }
                    script.push("build " + this.#escape(objFile) + ": asm " + this.#escape(asmSource));
                }
                script.push("");
            }

            if (objFiles && objFiles.length > 0) {
                script.push("build $target | $dbg_out : link " + this.#join(objFiles, null, null, true));
            }

        }

        script.push("");
        script.push("build all: phony $target");
        script.push("default all");
        script.push("");

        if (buildFileDirty) {
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
