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
    "#include": { tokenType: TokenType.Include,valueType: TokenValueType.Filename }
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
        }
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

        const settings = this._settings;

        this._data = data;

        this._basedir = path.dirname(this._configfile);
        this._builddir = path.resolve(this._basedir, "build");
        this._buildfile = path.resolve(this._builddir, "build.ninja");
        this._compilecommandsfile = path.resolve(this._builddir, "compile_commands.json");

        this.#load();

        this._outname = this._name + ".prg";
        this._outfile = path.resolve(this._builddir, this._outname);

        const toolkit = this._toolkit;

        if (toolkit == "acme") {
            this._outdebug = path.resolve(this._builddir, this._name + ".report");
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

    }

    #load() {
        const data = this._data;
        if (!data) return;

        if (!data.name) { throw("property 'name' is missing."); }
        this._name = data.name;

        if (!data.toolkit) { throw("property 'toolkit' needs to be defined (either 'acme' or 'cc65')"); }
        this._toolkit = data.toolkit.toLowerCase();
        if (this._toolkit != "acme" && this._toolkit != "cc65" && this._toolkit != "llvm") { throw("property 'toolkit' needs to be either 'acme', 'cc65' or 'llvm'"); }

        const settings = this._settings;
        const projectDir = this.basedir;

        if (!data.main && !data.sources) { throw("properties 'sources' or 'main' are missing."); }

        const srcs = [];

        if (data.main) {
            srcs.push(path.resolve(this._basedir, data.main));
        }

        if (data.sources) {
            for (const src of data.sources) {
                const filename = path.resolve(this._basedir, src);
                if (srcs.indexOf(filename) == -1) srcs.push(filename);
            }
        }

        this._sources = srcs;

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
        }

        { // additional settings
            this._startAddress = data.startAddress;
        }

    }

    isSource(filename) {
        if (!filename) return false;

        const normalizedFilename = Utils.normalizePath(filename);

        const srcs = this._sources;
        if (!srcs || srcs.length < 1) return false;

        for (const src of srcs) {
            const srcPath = Utils.normalizePath(src);
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

        while (pos < endpos && isWhitespace(source[pos])) {
            pos++;
        }

        if (pos == endpos) return null;

        const firstChar = source[pos];

        // just scan for special tokens
        if (firstChar != '!' && firstChar != '#') return null;

        let token = null;

        for (const tokenName of Object.keys(TokenDescriptors)) {
            const tokenDescriptor = TokenDescriptors[tokenName];

            if (source.startsWith(tokenName, pos)) {
                pos += tokenName.length;
                let value = source.substring(pos).trim();

                if (value.length > 0) {
                    if (value[0] == '"') {
                        value = value.substring(1, value.length-1);
                    } else if (value[0] == '<') {
                        value = value.substring(1, value.length-1);
                    }
                }

                token = new Token(tokenDescriptor, value, lineNumber);
                break;
            }
        }

        return token;
    }

    querySourceByExtension(extensions) {
        const srcs = this.sources;
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
        const esc = s.replaceAll(':', '$:');
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

    #writeCompileCommands(commands) {
        if (!commands) return;

        const filename = this.compilecommandsfile;

        try {
            const json = (JSON.stringify(commands, null, 4) + "\n").replace(/\\\\/g, "/");

            fs.writeFileSync(filename, json, 'utf8');
        } catch (e) {
            logger.error("could not write compile commands file: " + e);
        }
    }

    #declareCompileCommand(filename, includes, defines, args) {

        const settings = this._settings;
        const workingDirectory = process.cwd();

        const command = {
            directory: workingDirectory,
            file: filename,
            arguments: []
        };

        if (args) {
            command.arguments.push(...args);
        }

        if (defines) {
            for (const define of defines) {
                command.arguments.push("-D");
                command.arguments.push(define);
            }
        }

        if (includes) {
            for (const include of includes) {
                command.arguments.push("-I");
                command.arguments.push(include);
            }
        }

        const compilerIncludes = settings.compilerIncludes;
        if (compilerIncludes) {
            for (const include of compilerIncludes) {
                command.arguments.push("-I");
                command.arguments.push(include);
            }
        }

        return command;
    }

    createBuildFile() {

        const project = this;

        const releaseBuild = (project.buildType.toLowerCase() == "release") ? true : false;

        try {
            if (!fs.existsSync(project.builddir)){
                fs.mkdirSync(project.builddir);
                logger.debug("build: created project build directory");
            }
        } catch (e) {;}

        const buildFile = this.buildfile;

        let modificationTime = Utils.getFileTime(buildFile);
        if (modificationTime && modificationTime >= project.modificationTime) {
            // already up-to-date
            return;
        }

        const settings = this._settings;
        const toolkit = project.toolkit;

        const compileCommands = [];
        const defines = [];

        if (project.definitions) {
            defines.push(...project.definitions);
        }

        if (!releaseBuild) {
            defines.push("DEBUG");
        }

        const script = [];

        script.push("################################################################################");
        script.push("# BUILD FILE");
        script.push("# generated file: DO NOT EDIT!");
        script.push("################################################################################");
        script.push("");

        script.push("ninja_required_version = 1.3");
        script.push(this.#keyValue("builddir", project.builddir));
        script.push("");

        script.push(this.#keyValue("project", project.name));
        script.push(this.#keyValue("target", project.outfile));
        script.push(this.#keyValue("dbg_out", project.outdebug));
        script.push("");

        if (toolkit == "acme") {

            const asmSources = this.querySourceByExtension("|.s|.asm|");

            const dependencies = [ ...asmSources ];
            for (const asmSource of asmSources) {
                this.#getReferences(asmSource, dependencies);
            }
            this.#createDependencyFile(project.outfile + ".d", project.outfile, dependencies);

            script.push(this.#keyValue("asm_exe", (project.assembler || settings.acmeExecutable)));
            script.push("");

            script.push(this.#keyValue("flags", "--msvc --maxerrors 99 -f cbm --cpu 6510 -DDEBUG=1 -r $dbg_out"));
            script.push(this.#keyValue("includes", this.#join(project.includes, "-I ")));

            script.push("");
            script.push("rule asm");
            script.push("    depfile = $out.d");
            script.push("    deps = gcc");
            script.push("    command = $asm_exe $flags $includes -o $out $in");

            script.push("");
            script.push("build $target | $dbg_out : asm " + this.#join(asmSources, null, null, true))

        } else if (toolkit == "cc65") {

            const cppSources = project.querySourceByExtension("|.c|.cpp|.cc|");
            const asmSources = project.querySourceByExtension("|.s|.asm|")||[];
            const objFiles = project.querySourceByExtension("|.o|.obj|")||[];

            script.push(this.#keyValue("cc_exe", (project.compiler || settings.cc65Executable)));
            script.push(this.#keyValue("asm_exe", (project.assembler || settings.ca65Executable)));
            script.push(this.#keyValue("ln_exe", (project.linker || settings.ld65Executable)));
            script.push("");

            let flags = "-t c64 -g";

            if (releaseBuild) {
                flags += " -O -Oirs";
            }

            let defs = "";
            if (defines && defines.length > 0) {
                defs += this.#join(defines, "-D");
            }

            let ln_flags = "-t c64 --dbgfile $dbg_out";
            if (project.startAddress) {
                ln_flags += "-S" + project.startAddress;
            }

            script.push(this.#keyValue("flags", flags));
            script.push(this.#keyValue("ln_flags", ln_flags));
            script.push(this.#keyValue("includes", this.#join(project.includes, "-I ")));
            script.push(this.#keyValue("defs", defs));
            script.push(this.#keyValue("libs", "c64.lib"));
            script.push("");

            script.push("rule cc");
            script.push("    depfile = $out.d");
            script.push("    deps = gcc");
            script.push("    command = $cc_exe -o $out $flags $includes $in");
            script.push("");

            script.push("rule asm");
            script.push("    depfile = $out.d");
            script.push("    deps = gcc");
            script.push("    command = $asm_exe -o $out $flags $includes $in");
            script.push("");

            script.push("rule link");
            script.push("    command = $ln_exe -o $out $ln_flags $in $libs");
            script.push("");

            if (cppSources && cppSources.length > 0) {
                for (let cppSource of cppSources) {

                    const asmSource = path.resolve(project.builddir, path.basename(cppSource, path.extname(cppSource)) + ".s");
                    if (asmSources.indexOf(asmSource) == -1) {
                        asmSources.push(asmSource);
                    }

                    script.push("build " + this.#escape(asmSource) + ": cc " + this.#escape(cppSource));
                    this.#createDependencyFile(asmSource + ".d", asmSource, [ cppSource, ...this.#getReferences(cppSource) ]);
                    compileCommands.push(this.#declareCompileCommand(cppSource, project.includes, defines));
                }
                script.push("");
            }

            if (asmSources && asmSources.length > 0) {
                for (const asmSource of asmSources) {
                    const objFile = path.resolve(project.builddir, path.basename(asmSource, path.extname(asmSource)) + ".o");
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

            const cppSources = project.querySourceByExtension("|.c|.cpp|.cc|");
            const asmSources = project.querySourceByExtension("|.s|.asm|")||[];
            const objFiles = project.querySourceByExtension("|.o|.obj|")||[];

            script.push(this.#keyValue("clang", (project.compiler || settings.clangExecutable)));
            script.push("");

            let flags = "-Wall -std=gnu++20 -g -fstandalone-debug -fno-limit-debug-info -fno-discard-value-names -c";
            // flags += "-fcrash-diagnostics-dir=" + project.builddir + -fcrash-diagnostics=all";

            let defs = "";
            if (defines && defines.length > 0) {
                defs += this.#join(defines, "-D");
            }

            if (releaseBuild) {
                flags += " -Ofast";
            } else {
                flags += " -O0";
            }

            script.push(this.#keyValue("cfgflags", "--config mos-c64.cfg"));
            script.push(this.#keyValue("flags", flags));
            script.push(this.#keyValue("asmflags", "-x assembler-with-cpp"));
            script.push(this.#keyValue("includes", this.#join(project.includes, "-I ")));
            script.push(this.#keyValue("defs", defs));
            script.push("");

            script.push("rule cc");
            script.push("    depfile = $out.d");
            script.push("    deps = gcc");
            script.push("    command = $clang $cfgflags -MD -MF $out.d $flags $defs $includes -o $out $in");
            script.push("");

            script.push("rule asm");
            script.push("    depfile = $out.d");
            script.push("    deps = gcc");
            script.push("    command = $clang $cfgflags -MD -MF $out.d $flags $asmflags $defs $includes -o $out $in");
            script.push("");

            script.push("rule link");
            script.push("    command = $clang $cfgflags -O0 -o $out $in");
            script.push("");

            if (cppSources && cppSources.length > 0) {
                for (let cppSource of cppSources) {
                    const objFile = path.resolve(project.builddir, path.basename(cppSource, path.extname(cppSource)) + ".o");
                    if (objFiles.indexOf(objFile) == -1) {
                        objFiles.push(objFile);
                    }
                    script.push("build " + this.#escape(objFile) + ": cc " + this.#escape(cppSource));
                    compileCommands.push(this.#declareCompileCommand(cppSource, project.includes, defines));
                }
                script.push("");
            }

            if (asmSources && asmSources.length > 0) {
                    for (const asmSource of asmSources) {
                    const objFile = path.resolve(project.builddir, path.basename(asmSource, path.extname(asmSource)) + ".o");
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

        const fileData = script.join("\n");

        try {
            fs.writeFileSync(buildFile, fileData, "utf8");
        } catch (err) {
            console.log("failed to write build file: " + err);
        }

        this.#writeCompileCommands(compileCommands);
    }


}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Project: Project
}
