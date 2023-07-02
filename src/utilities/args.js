//
// Args
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

//-----------------------------------------------------------------------------------------------//
// Arguments
//-----------------------------------------------------------------------------------------------//

class Arguments {
    constructor(optionPrefix) {
        this._argv = [];
        this._options = new Map();
        this._flags = new Set();
        this._values = [];

        this._optionPrefix = (optionPrefix ? optionPrefix : "--");
    }

    static fromString(str) {
        const args = new Arguments();
        args.#setString(str);
        return args;
    }

    static fromArgv(argv) {
        const args = new Arguments();
        args.#setArgv(argv);
        return args;
    }

    get argv() { return this._argv; }
    get argc() { return this._argv.length; }
    get values() { return this._values; }
    get flags() { return this._flags; }
    get options() { return this._options; }

    set(args) {
        this.#clear();

        if (args == null) return;

        if (typeof args === "string") {
            this.#setString(args);
        } else if (typeof args === "object") {
            if (args._argv) {
                this.#setArgv(args._argv);
            } else {
                this.#setArgv(args);
            }
        }
    }

    #setString(str) {
        if (!str || str.length < 1) {
            this.#clear();
            return;
        }

        const args = str.split(/\s+/);
        this.#setArgv(args);
    }

    #setArgv(argv) {
        if (argv) {
            for (const arg of argv) {
                if (arg && arg.length > 0) {
                    this._argv.push(String(arg));
                }
            }
        }

        this.#parse();
    }

    getOption(key, defaultValue) {
        if (key == null || key.length < 1) return defaultValue || null;
        const value = this._options.get(key.toLowerCase());
        if (!value) return defaultValue || null;
        return value;
    }

    hasOption(key) {
        if (key == null || key.length < 1) return false;
        return this._options.has(key.toLowerCase());
    }

    setOption(key, value) {
        if (key == null || key.length < 1) return;
        if (value != null) {
            this._options.set(key.toLowerCase(), value);
        } else  {
            this._options.delete(key.toLowerCase());
        }

        this.#buildArgv();
    }

    getFlag(key) {
        if (key == null || key.length < 1) return false;
        return this._flags.has(key.toLowerCase());
    }

    setFlag(key, value) {
        if (key == null || key.length < 1) return;
        if (value == null || value == false) this._flags.delete(key);
        else this._flags.add(key.toLowerCase());

        this.#buildArgv();
    }

    getValue(idx, defaultValue) {
        let value = defaultValue || null;
        if (idx >= 0 && idx < this._values.length) value = this._values[idx];
        return value;
    }

    addValue(value) {
        if (value == null) return;
        this._values.push(value);

        this.#buildArgv();
    }

    toString() {
        return this._argv.join(" ");
    }

    #clear() {
        this._argv = [];
        this._options.clear();
        this._flags.clear();
        this._values = [];
    }

    #parse() {
        const optionPrefix = this._optionPrefix;

        const argv = this._argv;
        const argc = argv.length;

        const options = this._options;
        options.clear();

        const flags = this._flags;
        flags.clear();

        this._values = [];
        const values = this._values;

        let i=0;
        while (i < argc) {
            const arg = argv[i];

            if (arg.length > 2 && arg.startsWith(optionPrefix)) {
                const key = arg.substring(2).toLowerCase();
                const arg2 = (i < argc-1) ? argv[i+1] : "";
                if (!arg2.startsWith(optionPrefix)) {
                    const value = arg2;
                    options.set(key, value);
                    i++;
                } else {
                    flags.add(key);
                }
            } else {
                values.push(arg);
            }

            i++;
        }
    }

    #buildArgv() {

        const optionPrefix = this._optionPrefix;

        this._argv = [];

        this._flags.forEach((key) => {
            this._argv.push(optionPrefix + key);
        });

        this._options.forEach((value, key) => {
            this._argv.push(optionPrefix + key);
            this._argv.push(value);
        });

        this._values.forEach((value) => {
            this._argv.push(value);
        });
    }

}

//-----------------------------------------------------------------------------------------------//
// ArgumentList
//-----------------------------------------------------------------------------------------------//
class ArgumentList {
    constructor(...args) {
        this._argv = null;

        if (args) {
            this.add(...args);
        }
    }

    get elements() {
        return this._argv;
    }

    get length() {
        if (!this._argv) return 0;
        return this._argv.length;
    }

    add(...args) {
        if (!args) return;
        if (!this._argv) this._argv = [];

        for (const arg of args) {
            if (typeof arg === "string") {
                this._argv.push(arg);
            } else if (typeof arg === "object") {
                this._argv.push(...arg);
            }
        }
    }

    clear() {
        this._argv = null;
    }

    empty() {
        return this.length < 1;
    }

    join(param, prefix, suffix) {
        if (this.empty()) return "";

        let s = "";
        for (let arg of this._argv) {
            if (arg) {
                if (s.length > 0) s += " ";
                if (prefix) s += prefix;
                if (!param) {
                    s += arg;               // no params
                } else if (typeof param === "string") {
                    s += param + arg;       // param is a prefix
                } else {
                    s += param(arg);        // param is a transform function
                }
                if (suffix) s += suffix;
            }
        }

        return s;
    }

    indexOf(s) {
        if (this.empty()) return -1;
        return this._argv.indexOf(s);
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Arguments: Arguments,
    ArgumentList: ArgumentList
};
