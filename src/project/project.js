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
    "!source": { tokenType: TokenType.Include,valueType: TokenValueType.Filename }
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
    }

    get error() { return this._error; }

    get name() { return this._name; }
    get toolkit() { return this._toolkit; }
    get sources() { return this._sources; }
    get description() { return this._description_; }
    get basedir() { return this._basedir; }
    get builddir() { return this._builddir; }
    get files() { return this._files||[]; }
    get outname() { return this._outname; }
    get outfile() { return this._outfile; }
    get outmap() { return this._outmap; }
    get outlabels() { return this._outlabels; }
    get outdebug() { return this._outdebug; }
    get outlisting() { return this._outlisting; }
    get cachefile() { return this._cachefile; }
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

    isValid() {
        if (this.error) return false;
        if (!this.basedir || this.basedir.length < 1) return false;
        if (!this.builddir || this.builddir.length < 1) return false;
        return true;
    }

    fromFileIfChanged(filename) {

        let reload = false;

        let modificationTime = null;

        try {
            const stats = fs.statSync(filename);
            modificationTime = new Date(stats.mtime).getTime();
        } catch (e) {
            return;
        }

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
        this._cachefile = path.resolve(this._builddir, "project-cache.json");
        this._compilecommandsfile = path.resolve(this._builddir, "compile_commands.json");

        this.#load();

        this._outname = this._name + ".prg";
        this._outfile = path.resolve(this._builddir, this._outname);
        this._buildfiles = [];

        const toolkit = this._toolkit;

        if (toolkit == "acme") {
            this._outdebug = path.resolve(this._builddir, this._name + ".report");
        } else if (toolkit == "llvm") {
            this._outdebug = path.resolve(this._builddir, this._outfile + ".elf");
        } else if (toolkit == "cc65") {
            this._outmap = path.resolve(this._builddir, this._name + ".map");
            this._outlabels = path.resolve(this._builddir, this._name + ".labels");
            this._outdebug = path.resolve(this._builddir, this._name + ".dbg");
        }

        if (this._outdebug) {
            this._buildfiles.push(this._outdebug);
        }

        this._files = null;
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

    scan() {
        this.#clearFiles();

        const configfile = this.configfile;
        this.#addFile(configfile);

        const sources = this._sources;
        if (sources) {
            for (const source of this._sources) {
                this.#scanFile(source);
            }
        }
    }

    #clearFiles() {
        this._files = null;
    }

    #addFile(filename) {
        if (!this._files) this._files = [];
        this._files.push(filename);
    }

    #hasFile(filename) {
        if (!this._files) return false;
        return (this._files.indexOf(filename) >= 0);
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

    #scanFile(filename) {

        logger.debug("scanFile: " + filename);

        const dirname = path.dirname(filename);

        if (this.#hasFile(filename)) return;

        let source = null;

        try {
            source = fs.readFileSync(filename, 'utf8');
        } catch(err) {
            throw(err);
        }

        const tokens = this.#parse(source);

        this.#addFile(filename);

        if (tokens) {
            for (const token of tokens) {
                if (token.type == TokenType.Include) {
                    const includedFile = this.resolveFile(token.value, dirname);
                    if (!includedFile) {
                        throw(filename + ", line " + (token.line+1) + ": Referenced file " + token.value + " does not exist.");
                    }
                    this.#scanFile(includedFile);
                }
            }
        }

    }

    #parse(source) {

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
        if (firstChar != '!') return null;

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

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Project: Project
}
