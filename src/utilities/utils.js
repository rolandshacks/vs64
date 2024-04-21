//
// Utilities
//

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');
const process = require('process');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { Logger } = require('utilities/logger');

const logger = new Logger("Utils");

//-----------------------------------------------------------------------------------------------//
// Utilities
//-----------------------------------------------------------------------------------------------//

let Utils = {

    ZEROS: "0000000000000000000000000000000000000000",

    sleep: function(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    },

    BASE64_CHARSET: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
                    "abcdefghijklmnopqrstuvwxyz" +
                    "0123456789+/",

    toBase64: function(mem, ofs, len) {

        if (null == ofs) ofs = 0;
        if (ofs > mem.length) return "";
        if (null == len) len = mem.length - ofs;
        if (len <= 0) return "";

        let s = "";

        let acc = 0x0;
        let bits = 0;

        for (let i=ofs; i<ofs + len; i++) {
            acc <<= 8;
            acc += mem[i];
            bits += 8;

            while (bits >= 6) {
                bits -= 6;
                const c = ((acc >> bits) & 0x3f);
                s += Utils.BASE64_CHARSET[c];
                acc = (bits > 0) ? acc & ((1<<bits)-1) : 0;
            }
        }

        if (bits > 0) {
            s += Utils.BASE64_CHARSET[acc << (6-bits)];
        }

        let padding = (s.length % 4);
        while (padding > 0 && padding < 4) {
            s += "=";
            padding++;
        }

        return s;
    },

    fmtAddress: function(a) {
        return ("0000"+a.toString(16)).substr(-4);
    },

    formatHex: function(n, digits, prefix) {
        let s = n.toString(16);
        if (digits && digits > 0) {
            let v = "0000000000000000" + s;
            s = v.substring(v.length - digits);
        }
        if (prefix) return prefix + s;
        return s;
    },

    formatMemory: function(mem, ofs, num, elementSize, prefix, separator) {
        if (null == mem) return;

        let s = "";

        if (!elementSize) elementSize = 1;
        const endPos = Math.min(num, mem.length) + 1 - elementSize;

        let pos = 0;
        while (pos < endPos) {
            const notFirst = (pos > 0);
            if (notFirst && separator) s += separator;

            let value = 0;
            if (elementSize == 1) {
                value = mem[ofs+pos];
                pos++;
            } else {
                for (let i=0; i<elementSize; i++) {
                    value = (value << 8) + mem[ofs+pos];
                    pos++;
                }
            }
            s += Utils.formatHex(value, elementSize * 2, notFirst ? prefix : null);
        }

        return s;
    },

    dumpMemory: function(mem, num) {
        if (null == mem) return;

        let count = 0;

        let s = "";

        for (const b of mem) {
            count++; if (num && count > num) break;
            if (s.length > 0) s += " ";
            s += Utils.formatHex(b, 2, "0x");
            if (s.length > 128) {
                logger.debug(s);
                s = "";
            }
        }

        if (s.length > 0) {
            logger.debug(s);
            s = "";
        }
    },

    fmt: function(n, digits, rightFill) {
        if (rightFill) {
            return (n + Utils.ZEROS).substr(0, digits);
        } else {
            return (Utils.ZEROS + n).substr(-digits);
        }
    },

    /*
    log: function(txt) {

        const d = new Date();
        const timestamp = "" + Utils.fmt(d.getHours(),2) + ":" +Utils.fmt(d.getMinutes(), 2) + ":" + Utils.fmt(d.getSeconds(), 2) + "." + Utils.fmt(d.getMilliseconds(), 3);

        logger.info(timestamp + " " + txt);
    },
    */

    mkdirRecursive: function(dirname) {

        if (null == dirname || dirname == "") {
            return false;
        }

        if (fs.existsSync(dirname)) {
            return true;
        }

        let parentDir = path.dirname(dirname);
        if (parentDir.toLowerCase() == dirname.toLowerCase()) {
            return false;
        }

        if (!fs.existsSync(parentDir)) {
            if (false == Utils.mkdirRecursive(parentDir)) {
                return false;
            }
        }

        try {
            fs.mkdirSync(dirname);
        } catch (error) {
            return false;
        }

        return true;
    },

    getFileTime: function(filename) {
        if (!fs.existsSync(filename)) return 0;
        const filestats = fs.statSync(filename);
        const tm = new Date(filestats.mtime).getTime();
        return tm;
    },

    compareFileTime: function(fileA, fileB) {

        let existsA = fs.existsSync(fileA);
        let existsB = fs.existsSync(fileB);

        if (!existsB && !existsA) {
            return 0;
        }

        if (!existsB) {
            return -1;
        }

        if (!existsA) {
            return 1;
        }

        let statsA = fs.statSync(fileA);
        let statsB = fs.statSync(fileB);

        let timeA = new Date(statsA.mtime).getTime();
        let timeB = new Date(statsB.mtime).getTime();

        if (timeA > timeB) {
            return -1;
        } else if (timeA < timeB) {
            return 1;
        } else {
            return 0;
        }
    },

    changeExtension: function(filename, extension) {
        let pos = filename.lastIndexOf('.');
        if (pos < 0) {
            return filename + extension||"";
        }

        return filename.substr(0, pos) + extension||"";
    },

    getExtension: function(filename) {
        let pos = filename.lastIndexOf('.');
        if (pos < 0) {
            return "";
        }

        return filename.substr(pos + 1);
    },

    findFile: function(baseDir, filename) {
        if (!fs.existsSync(baseDir)) {
            return null;
        }

        let elements = fs.readdirSync(baseDir);
        for (let i=0, element; (element=elements[i]); i++) {
            let filePath = path.join(baseDir, element);
            let stat = fs.lstatSync(filePath);
            if (stat.isDirectory()) {
                return Utils.findFile(filePath, filename);
            } else if (filename == element) {
                return filePath;
            }
        }
    },

    splitQuotedString: function (str) {
        let output = [];

        if (null == str) return output;

        let token = "";
        let inside_quotes = false;
        for (let c,i=0; c=str[i]; i++) {

            if ('"' == c) {
                if (inside_quotes) {
                    inside_quotes = false;
                    if (token.length > 0) output.push(token);
                    token = "";
                } else {
                    inside_quotes = true;
                }
            } else if (" \t\r\n".indexOf(c) != -1) {
                if (inside_quotes) {
                    token += c;
                } else {
                    if (token.length > 0) output.push(token);
                    token = "";
                }
            } else {
                token += c;
            }

            //logger.info("[" + c + "] >" + token + "<");
        }

        if (token.length > 0) output.push(token);

        return output;
    },

    normalizeExecutableName: function(filename) {

        if (null == filename || filename == "") return filename;

        if ("win32" == process.platform) {

            let ext = path.extname(filename);
            if (ext == "") {
                filename += ".exe";
            } else if (ext == ".") {
                filename += "exe";
            }

        }

        return filename;
    },

    exec: function(executable, args, options) {

        const commandLine = executable + " " + args.join(" ");
        logger.debug("spawn child process: " + commandLine);

        return new Promise((resolve, reject) => {

            const spawnOptions = {};

            if (options && options.cwd) {
                spawnOptions.cwd = options.cwd;
            }

            const procInfo = {
                process: null,
                created: false,
                exited: false,
                stdout: [],
                stderr: [],
                exitCode: 0,
                errorInfo: null
            };

            const proc = spawn(executable, args, spawnOptions);
            procInfo.process = proc;

            proc.stdout.setEncoding('utf8');
            proc.stdout.on('data', (data) => {
                const lines = (data+"").split('\n');
                for (let i=0, line; (line=lines[i]); i++) {
                    if (null == line) continue;
                    if (line.trim().length > 0) {
                        procInfo.stdout.push(line);
                        if (options && options.onstdout) options.onstdout(line);
                    }
                }
            });

            proc.stderr.setEncoding('utf8');
            proc.stderr.on('data', (data) => {
                const lines = (data+"").split('\n');
                for (let i=0, line; (line=lines[i]); i++) {
                    if (null == line) continue;
                    if (line.trim().length > 0) {
                        procInfo.stderr.push(line);
                        if (options && options.onstderr) options.onstderr(line);
                    }
                }
            });

            proc.on('spawn', () => {
                procInfo.created = true;
                if (options && options.onstart) options.onstart(procInfo);
                if (!(options && options.sync)) {
                    // async mode: wait for start, but not for exit
                    resolve(procInfo);
                }
            });

            proc.on('error', (err) => {
                procInfo.exited = true;
                procInfo.errorInfo = err;
                reject(procInfo);
            });

            proc.on('exit', (code) => {
                procInfo.exited = true;
                procInfo.exitCode = code;
                if (options && options.onexit) options.onexit(procInfo);

                if (options && options.sync) {
                    // sync mode: wait for exit
                    if (0 == code) {
                        resolve(procInfo);
                    } else {
                        reject(procInfo);
                    }
                }
            });
        });
    },

    normalizePath: function(filename) {
        let refName = path.resolve(path.normalize(filename));
        if (process.platform === "win32") {
            refName = refName.toUpperCase();
            if (refName.length >= 2 && refName.charAt(1) == ':') {
                refName = refName.substring(0, 1).toUpperCase() + refName.substring(1);
            }

        }
        return refName;
    },

    fileExists: function(filename) {
        if (!filename || filename.length == 0) return false;
        return (fs.existsSync(filename));

    },

    isFile: function(filename) {
        if (!Utils.fileExists(filename)) return false;

        try {
            return fs.lstatSync(filename).isFile();
        } catch (err) {}

        return false;
    },

    isFolder: function(filename) {
        if (!Utils.fileExists(filename)) return false;

        try {
            return fs.lstatSync(filename).isDirectory();
        } catch (err) {}

        return false;
    },


    getEnumKey: function(enumDef, enumValue) {
        for (const element of Object.entries(enumDef)) {
            if (element[1] == enumValue) {
                return element[0];
            }
        }
        return null;
    },

    findFiles: function(folder, filterFn, skipList) {
        return Utils.findFilesImpl(folder, null, null, filterFn, skipList);
    },

    findFilesImpl: function(folder, _relFolder, _files, filterFn, skipList) {

        _relFolder ||= "";
        _files ||= [];

        const elements = fs.readdirSync(folder);
        for (const fileName of elements) {

            if (fileName == ".git") continue;
            if (skipList && skipList.indexOf(fileName) >= 0) continue;

            const absFilePath = path.join(folder, fileName);
            const relFilePath = path.join(_relFolder, fileName);
            const stat = fs.lstatSync(absFilePath);

            if (stat.isDirectory()) {
                const foundFolder = {
                    relFilePath: relFilePath,
                    absFilePath: absFilePath,
                    isDirectory: true,
                    extension: ""
                };

                if (!filterFn || filterFn(foundFolder)) {
                    _files.push(foundFolder);
                }

                Utils.findFilesImpl(absFilePath, relFilePath, _files, filterFn, skipList);

            } else {

                const foundFile = {
                    relFilePath: relFilePath,
                    absFilePath: absFilePath,
                    isDirectory: false,
                    extension: path.extname(relFilePath).toLowerCase()
                };

                if (!filterFn || filterFn(foundFile)) {
                    _files.push(foundFile);
                }
            }
        }

        return _files;
    },

    createFolder: function(dest) {
        try {
            const stat = fs.lstatSync(dest);
            if (stat.isDirectory()) {
                return; // already exists
            } else if (stat.isFile()) {
                throw("cannot create directory because file with same name already exists");
            }
        } catch (err) {;}

        fs.mkdirSync(dest, { recursive: true });
    },

    copy: function(source, dest, filterFn) {
        const files = Utils.findFiles(source);
        for (const item of files) {
            if (filterFn && !filterFn(item)) continue; // skip filtered item
            const destPath = path.join(dest, item.relFilePath);
            if (item.isDirectory) {
                Utils.createFolder(destPath);
            } else {
                const sourcePath = path.join(source, item.relFilePath);
                Utils.copyFile(sourcePath, destPath);
            }
        }
    },

    copyFile: function(source, dest) {
        const destFolder = path.dirname(dest);
        this.createFolder(destFolder);

        try {
            const stat = fs.lstatSync(dest);
            if (stat.isDirectory()) {
                throw("cannot copy file because directory with same name already exists");
            } else if (stat.isFile()) {
                /*
                const result = vscode.window.showInformationMessage(
                    "The file " + dest + " already exists. Do you want to overwrite or skip it?",
                    "Overwrite",
                    "Skip"
                ).then((action) => {
                    if (action && action == "Skip") {
                        return;
                    }
                });
                */
                return; // already exists
            }
        } catch (err) { ; }

        const data = fs.readFileSync(source);
        fs.writeFileSync(dest, data);
    },

    setExecutablePermission: function(filename) {

        try {
            const fd = fs.openSync(filename, 'r');
            fs.fchmodSync(fd, 0o775);
            fs.close(fd);
        } catch (e) {}
    },

    findInPath: function(filename) {

        const pathVar = process.env.PATH;
        const pathDirs = pathVar.split(";")

        for (const pathDir of pathDirs) {
            const absName = path.resolve(pathDir, Utils.normalizeExecutableName(filename));
            if (Utils.isFile(absName)) {
                return absName;
            }
        }

        return null;
    },

    isSubfolderOf: function(subfolder, folder) {
        const relative = path.relative(folder, subfolder);
        return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
    },

    getDefaultPythonExecutablePath: function() {

        const pythonAliases = [ "python3", "python" ];

        for (const executableName of pythonAliases) {
            const absPath = Utils.findInPath(executableName);
            if (absPath) return absPath;
        }

        return null;
    },

    md5: function(str) {
        if (!str || str.length < 1) return "0".repeat(32);
        const result = crypto.createHash('md5').update(str).digest("hex");
        return result;
    },

    isWhitespace: function(c) {
        return c === ' '
            || c === '\n'
            || c === '\t'
            || c === '\r'
            || c === '\f'
            || c === '\v'
            || c === '\u00a0'
            || c === '\u1680'
            || c === '\u2000'
            || c === '\u200a'
            || c === '\u2028'
            || c === '\u2029'
            || c === '\u202f'
            || c === '\u205f'
            || c === '\u3000'
            || c === '\ufeff';
    },

};

//-----------------------------------------------------------------------------------------------//
// Formatter
//-----------------------------------------------------------------------------------------------//

let Formatter = {
    formatValue: function(value, plain) {
        return Formatter.formatU16(value, plain);
    },

    formatAddress: function(value, plain) {
        return Formatter.formatU16(value, plain);
    },

    formatBit: function(value, plain) {
        if (plain) return (0 == value) ? "0" : "1";
        return (0 == value) ? "0 (unset)" : "1 (set)";
    },

    formatBool: function(value) {
        return (0 == value) ? "false" : "true";
    },

    formatU8: function(value, plain) {
        if (plain) return "$" + Utils.fmt(value.toString(16), 2);
        return "$" + Utils.fmt(value.toString(16), 2) + " (" + value.toString() + ")";
    },

    formatU8dec: function(value, plain) {
        if (plain) return value.toString();
        return value.toString() + " ($" + Utils.fmt(value.toString(16), 2) + ")";
    },

    formatU16: function(value, plain) {
        if (plain) return "$" + Utils.fmt(value.toString(16), 4);
        return "$" + Utils.fmt(value.toString(16), 4) + " (" + value.toString() + ")";
    },

    formatU16dec: function(value, plain) {
        if (plain) return value.toString();
        return value.toString() + " ($" + Utils.fmt(value.toString(16), 4) + ")";
    },

    formatU32: function(value, plain) {
        if (plain) return "$" + Utils.fmt(value.toString(16), 8);
        return "$" + Utils.fmt(value.toString(16), 8) + " (" + value.toString() + ")";
    },

    formatU32dec: function(value, plain) {
        if (plain) return value.toString();
        return value.toString() + " ($" + Utils.fmt(value.toString(16), 8) + ")";
    }

}

//-----------------------------------------------------------------------------------------------//
// Sorted Array
//-----------------------------------------------------------------------------------------------//

class SortedArray {

    constructor(options) {
        this._options = options;

        this._less = options ? options.less : null;
        this._key = options ? options.key : null;

        this._min = null;
        this._max = null;
        this._elements = [];
    }

    [Symbol.iterator]() {
        var index = -1;
        var data  = this._elements;

        return {
          next: () => ({ value: data[++index], done: !(index in data) })
        };
    };

    #less(a, b) {
        if (null == a) return (b != null);
        if (null == b) return false;
        if (this._less) {
            return this._less(a, b);
        } else {
            return (this.#key(a) < this.#key(b));
        }
    }

    #key(a) {
        if (null == a) return null;
        if (this._key) {
            const k = this._key(a);
            return (k != null) ? k : a;
        } else {
            return a;
        }
    }

    #compare(a, b) {
        if (null == a && null == b) return true;
        if (null == a || null == b) return false;

        const key_a = this.#key(a);
        const key_b = this.#key(b);

        return this.#compareRaw(key_a, key_b);
    }

    #compareRaw(a, b) {
        if (null == a && null == b) return true;
        if (null == a || null == b) return false;

        if (a < b) {
            return -1;
        } else if (a > b) {
            return 1;
        } else {
            return 0;
        }
    }

    get length() {
        return this._elements.length;
    }

    get elements() {
        return this._elements;
    }

    get(idx) {
        if (this.length < 1) return null;
        return this._elements[idx];
    }

    clear() {
        this._elements.length = 0;
    }

    indexOf(element) {

        const elements = this._elements;
        const len = elements.length;

        if (null == element) return -1;

        const key_element = this.#key(element);

        // perform binary search

        let l = 0;
        let r = len-1;
        let m = 0;

        let foundPos = -1;

        while (l <= r) {

            m = Math.floor((l+r)/2);
            let e = elements[m];
            let key_e = this.#key(e);
            const comp = this.#compareRaw(key_element, key_e);
            if (comp == 0) {
                foundPos = m;
                break;
            } else if (comp < 0) {
                r = m - 1;
            } else {
                l = m + 1;
            }
        }

        return foundPos;
    }

    #findEqualOrMore(element) {

        if (!this._min || this.#less(element, this._min)) {
            return 0;
        }

        if (!this._max || !this.#less(element, this._max)) {
            return -1;
        }

        const elements = this._elements;
        const len = elements.length;

        // perform binary search

        let l = 0;
        let r = len-1;
        let m = 0;

        while (r - l > 2) {
            m = Math.floor((l+r)/2);
            let e = elements[m];

            if (this.#less(element, e)) {
                r = m - 1;
            } else {
                l = m;
            }
        }

        let foundPos = -1;

        while (l < len) {
            const e = elements[l];
            if (!this.#less(e, element)) {
                foundPos = l;
                break; // equal or bigger than existing, found position
            }
            ++l;
        }

        return foundPos;

    }

    push(element) {

        let pos = null;

        if (!this._min || this.#less(element, this._min, element)) {
            this._min = element;
            pos = 0;
        }

        if (!this._max || !this.#less(element, this._max)) {
            this._max = element;
            pos = -1;
        }

        if (null == pos) {
            pos = this.#findEqualOrMore(element);
        }

        if (pos >= 0) {
            // insert
            this._elements.splice(pos, 0, element);
        } else {
            // append
            this._elements.push(element);
        }

        return element;
    }

}

//-----------------------------------------------------------------------------------------------//
// StopWatch
//-----------------------------------------------------------------------------------------------//

class StopWatch {
    constructor() {
        this._start = null;
        this._elapsed = 0;
    }

    get elapsedNanos() { return this._elapsed; }
    get elapsedMicros() { return this._elapsed / 1000; }
    get elapsedMillis() { return this._elapsed / 1000000; }
    get elapsedSeconds() { return this._elapsed / 1000000000; }

    get elapsed() { return this.elapsedNanos; }

    start() {
        this._start = process.hrtime.bigint();
    }

    stop() {
        const current = process.hrtime.bigint();
        this._elapsed = Number(current - this._start);
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Utils: Utils,
    Formatter: Formatter,
    SortedArray: SortedArray,
    StopWatch: StopWatch
};
