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
        this._settings = settings;
        this._modificationTime = null;
    }

    fromFileIfChanged(filename) {

        let modificationTime = null;

        try {
            const stats = fs.statSync(filename);
            modificationTime = new Date(stats.mtime).getTime();
        } catch (e) {
            return;
        }

        let reload = false;
        const configFile = path.resolve(filename);

        if (!this._configfile || configFile != this._configfile) reload = true;
        if (!this._modificationTime || (modificationTime && modificationTime > this._modificationTime)) reload = true;

        if (reload) {
            this.fromFile(filename);
        }
    }

    fromFile(filename) {
        try {
            const stats = fs.statSync(filename);
            const json = fs.readFileSync(filename, 'utf8');
            this._configfile = path.resolve(filename);
            this._modificationTime = new Date(stats.mtime).getTime();
            this.fromJson(json);
        } catch(err) {
            logger.error("failed to read project configuration file: " + err);
        }
    }

    fromJson(json) {
        try {
            const data = JSON.parse(json);
            this.#init(data);
        } catch(err) {
            logger.error("failed to parse project configuration: " + err);
        }
        return null;
    }

    #init(data) {

        const settings = this._settings;

        this._data = data;

        this._basedir = path.dirname(this._configfile);
        this._builddir = path.resolve(this._basedir, "build");
        this._cachefile = path.resolve(this._builddir, "project-cache.json");

        this.#load();

        this._outname = this._name + ".prg";
        this._outfile = path.resolve(this._builddir, this._outname);
        this._outreport = path.resolve(this._builddir, this._name + ".report");
        this._outlabel = path.resolve(this._builddir, this._name + ".label");

        this._buildfiles = [
            this._outreport,
            this._outlabel
        ];

        this._files = null;
    }

    #load() {
        const data = this._data;
        if (!data) return;

        if (!data.name) { throw("property 'name' is missing."); }
        this._name = data.name;

        const settings = this._settings;
        const projectDir = this.basedir;

        if (!data.main) { throw("property 'main' is missing."); }
        this._main = path.resolve(this._basedir, data.main);

        this._description = data.description||"";

        this._compiler = data.compiler;

        { // definitions
            const definitions = [];
            if (settings.compilerDefines) {
                const defs = settings.compilerDefines.split(",");
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

            includes.push(path.dirname(this.main))

            if (data.includes) {
                includes.push(...data.includes);
            }
            if (settings.compilerIncludePaths) {
                const dirs = settings.compilerIncludePaths.split(",").map(item => item.trim());
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

        { // args

            const args = [];
            if (data.args) {
                args.push(...data.args);
            }

            if (settings.compilerArgs) {
                args.push(... Utils.splitQuotedString(settings.compilerArgs));
            }

            this._args = args;
        }

    }

    scan() {
        this.#clearFiles();

        const configfile = this.configfile;
        this.#addFile(configfile);

        const filename = path.resolve(this._main);

        this.#scanFile(filename);
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

    resolveFile(filename, refdir) {

        const projectDir = this.basedir;

        if (refdir) {
            const absFilename = path.resolve(refdir, filename);
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


    get name() { return this._name; }
    get main() { return this._main; }
    get description() { return this._description_; }
    get basedir() { return this._basedir; }
    get builddir() { return this._builddir; }
    get files() { return this._files||[]; }
    get outname() { return this._outname; }
    get outfile() { return this._outfile; }
    get outreport() { return this._outreport; }
    get outlabel() { return this._outlabel; }
    get cachefile() { return this._cachefile; }
    get buildfiles() { return this._buildfiles; }
    get includes() { return this._includes; }
    get definitions() { return this._definitions; }
    get args() { return this._args; }
    get compiler() { return this._compiler; }
    get configfile() { return this._configfile; }
    get settings() { return this._settings; }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Project: Project
}
