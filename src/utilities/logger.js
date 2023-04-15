//
// Logging
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

const { info } = require('console');
//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const process = require('process');
const path = require("path");

//-----------------------------------------------------------------------------------------------//
// Logger
//-----------------------------------------------------------------------------------------------//

const ZEROS = "00000000000000000000";
const SPACES = "                    ";

const LogLevel = {
    Trace : 0,
    Debug : 1,
    Info : 2,
    Warning : 3,
    Error : 4
};

const LogLevelNames = [
    "trace", "debug", "info", "warn", "error"
];

const LogLevelChars = [
    "T", "D", "I", "W", "E"
];

const LogLevelColors = [
    90, 90, 0, 33, 31
];

function getLogLevelFromString(level) {
    if (level == null) {
        return LogLevel.Info;
    } else {
        const levelName = (""+level).trim().toLowerCase();
        let idx = 0;
        for (const name of LogLevelNames) {
            if (name == levelName) {
                level = idx;
                break;
            }
            idx++;
        }
    }

    // not found, or number given
    return level;
}

class Time {

    static _get() {
        if (null == Time.offset) {
            Time.offset = process.hrtime();
            return [0, 0];
        }

        return process.hrtime(Time.offset);
    }

    static get nanos() {
        const t = this._get();
        return (t[0]*1000000000 + t[1]);
    }

    static get micros() {
        const t = this._get();
        return (t[0]*1000000 + t[1]/1000|0);
    }

    static get millis() {
        const t = this._get();
        return (t[0]*1000 + t[1]/1000000|0);
    }

    static get seconds() {
        const t = this._get();
        return t[0];
    }

}

Time.offset = null; // declare class property

class Logger {

    constructor(name) {
        Time.millis;
        this._name = name;
        this._defaultLevel = LogLevel.Info;
        this._level = null;
    }

    setLevel(level) {
        this._level = getLogLevelFromString(level);
    }

    getLevel() {
        return this._level;
    }

    static setGlobalLevel(level) {
        Logger._globalLevel = getLogLevelFromString(level);
    }

    static getGlobalLevel() {
        return Logger._globalLevel;
    }

    static getLevelName(level) {
        if (null == level || level < 0 || level >= LogLevelNames.length) {
            return "unknown";
        }
        return LogLevelNames[level];
    }

    static enableColors(enable) {
        Logger._enableColors = enable;
    }

    static setSink(sink) {
        Logger._sink = sink;
    }

    static setGlobalListener(globalListener) {
        Logger._globalListener = globalListener;
    }

    static _col(code, txt) {
        if (Logger._enableColors != true) return txt;
        return "\x1b[" + code + "m" + txt + "\x1b[0m";
    }

    _checkLevel(level) {
        if (level < Logger._globalLevel) return false;
        if (this._level != null && level < this._level) return false;
        return true;
    }
    
    when(level, fn) {
        if (!this._checkLevel(level)) return;
        fn();
    }

    notWhen(level, fn) {
        if (this._checkLevel(level)) return;
        fn();
    }

    log(txt) {
        this._out(this._defaultLevel, txt);
    }

    error(txt) {
        this._out(LogLevel.Error, txt);
    }

    warn(txt) {
        this._out(LogLevel.Warning, txt);
    }

    info(txt) {
        this._out(LogLevel.Info, txt);
    }

    debug(txt) {
        this._out(LogLevel.Debug, txt);
    }

    trace(txt) {
        this._out(LogLevel.Trace, txt);
    }

    _write(txt) {
        if (Logger._sink) {
            if (Logger._sink(txt) == false) return;
        }
        console.log(txt);
    }

    _out(level, txt, fn) {
        if (!this._checkLevel(level)) return;

        const time = Time.millis;
        const caller = this._getCaller();
        const str = this._format(time, caller, level, txt);

        if (Logger._globalListener) {
            const l = caller ? caller.file + ":" + caller.line + " " : "";
            const c = caller ? this._name + "." + caller.name : this._name;
            if (Logger._globalListener(level, txt, l, c) == false) return;
        }

        this._write(str);
    }

    _formatPlain(time, caller, level, txt) {
        const l = caller ? caller.file + ":" + caller.line + " " : "";
        const c = caller ? this._name + "." + caller.name : this._name;
        return this._formatTime(time) + " " +
               l + LogLevelChars[level] + "/" + c +
               ": " + txt;
    }

    _format(time, caller, level, txt) {
        const l = caller ? caller.file + ":" + caller.line + " " : "";
        const c = caller ? this._name + "." + caller.name : this._name;
        return Logger._col(36, this._formatTime(time)) + " " +
               Logger._col(36, l) + Logger._col(LogLevelColors[level], LogLevelChars[level] + "/" + c) +
               ": " + Logger._col(LogLevelColors[level], Logger._col(1, txt));
    }

    _formatTime(time) {
        const s = (time / 1000|0).toString();
        const m = (time % 1000).toString();

        const t = ((s.length < 3) ? SPACES.substring(0, 3 - s.length) + s : s)
                + "."
                + ((m.length < 3) ? ZEROS.substring(0, 3 - m.length) + m : m);

        return t;
    }

    _getCaller() {

        const offset = 4;
        const stack = new Error().stack;

        const lines = stack.split("\n");
        if (!lines || lines.size < offset) {
            return null;
        }

        const source = lines[offset].trim();
        let ofs = 0;
        if (!source.startsWith("at ")) return null;

        ofs += 3;

        let name = "";
        let pathname = "";
        let file = "";
        let line = 0;
        let pos = source.indexOf('(', ofs);

        let functionSource = "";

        if (pos >= 0) {
            name = source.substring(ofs, pos).trim();

            let endpos = source.indexOf(')', pos);
            if (endpos >= 0) {
                functionSource = source.substring(pos+1, endpos).trim();
            } else {
                functionSource = source.substring(pos+1).trim();
            }
        } else {
            name = "anonymous";
            functionSource = source.substring(ofs).trim();
        }

        let pos1 = functionSource.indexOf(':', 2);
        if (pos1 >= 0) {
            pathname = functionSource.substring(0, pos1).trim();
            file = path.basename(pathname);

            let pos2 = functionSource.indexOf(':', pos1+1);
            if (pos2 >= 0) {
                line = parseInt(functionSource.substring(pos1+1, pos2));
            } else {
                line = parseInt(functionSource.substring(pos1+1));
            }
        } else {
            file = functionSource;
        }

        return {
            name: name,
            pathname: pathname,
            file: file,
            line: line
        }

    }

}

Logger._globalLevel = LogLevel.Debug;
Logger._sink = null;
Logger._globalListener = null;
Logger._enableColors = true;


//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Logger: Logger,
    LogLevel: LogLevel,
    LogLevelNames: LogLevelNames,
    LogLevelChars: LogLevelChars
};
