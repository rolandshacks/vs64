//
// Utilities
//

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

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

    findExecutable: function(filename) {

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

    spawn: function(executable, args, exitFunction) {

        return new Promise((resolve, reject) => {

            const procInfo = {
                process: null,
                created: false,
                exited: false,
                stdout: [],
                stderr: [],
                errorInfo: null
            };

            const proc = spawn(executable, args);

            procInfo.process = proc;

            proc.stdout.on('data', (data) => {
                let lines = (data+"").split('\n');
                for (let i=0, line; (line=lines[i]); i++) {
                    if (null == line) continue;
                    if (line.trim().length > 0) {
                        procInfo.stdout.push(line);
                    }
                }
            });

            proc.stderr.on('data', (data) => {
                let lines = (data+"").split('\n');
                for (let i=0, line; (line=lines[i]); i++) {
                    if (null == line) continue;
                    if (line.trim().length > 0) {
                        procInfo.stderr.push(line);
                    }
                }
            });

            proc.on('spawn', () => {
                procInfo.created = true;
                resolve(procInfo);
            });

            proc.on('error', (err) => {
                procInfo.exited = true;
                procInfo.errorInfo = err;
                reject(procInfo);
            });

            proc.on('exit', (code) => {
                procInfo.exited = true;
                procInfo.exitCode = code;
                if (0 == code) {
                    if (exitFunction) exitFunction(procInfo);
                } else {
                    reject(procInfo);
                }
            });

        });
    },

    normalizePath: function(filename) {
        let refName = path.resolve(path.normalize(filename));
        if (process.platform === "win32") {
            refName = refName.toUpperCase();
        }
        return refName;
    }

};

//-----------------------------------------------------------------------------------------------//
// Formatter
//-----------------------------------------------------------------------------------------------//

let Formatter = {
    formatValue: function(value) {
        return Formatter.formatWord(value);
    },

    formatAddress: function(value) {
        return Formatter.formatWord(value);
    },

    formatBit: function(value) {
        return (0 == value) ? "0 (unset)" : "1 (set)";
    },

    formatByte: function(value) {
        return "$" + Utils.fmt(value.toString(16), 2) + " (" + value.toString() + ")";
    },

    formatWord: function(value) {
        return "$" + Utils.fmt(value.toString(16), 4) + " (" + value.toString() + ")";
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Utils: Utils,
    Formatter: Formatter
};
