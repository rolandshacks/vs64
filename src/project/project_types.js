//
// Scanner
//

const path = require("path");

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

//-----------------------------------------------------------------------------------------------//
// Project Item
//-----------------------------------------------------------------------------------------------//

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

//-----------------------------------------------------------------------------------------------//
// Translation List
//-----------------------------------------------------------------------------------------------//

class TranslationList {
    constructor(elements) {
        this._mapping = new Map();
        this._files = [];

        if (elements) {
            elements.forEach((to) => {
                if (to) this.add(to, null);
            });
        }
    }

    static fromList(elements) {
        return new TranslationList(elements);
    }

    static createEmpty() {
        return new TranslationList();
    }

    get size() {
        return this._mapping.size;
    }

    has(file) {
        return this._mapping.has(file);
    }

    add(to, from, rule) {
        if (!to || to.length < 1) return;

        let entry = this._mapping.get(to);
        if (!entry) {
            this._files.push(to);
            entry = {
                to: null,
                from: null,
                rule: null
            };
            this._mapping.set(to, entry);
        }

        if (!entry.to) entry.to = to;
        if (!entry.rule) entry.rule = rule;

        if (from) {
            if (!entry.from) {
                entry.from = from;
            } else {
                if (typeof entry.from === 'string') {
                    // change to array
                    entry.from = [ entry.from ];
                }
                if (typeof from === 'string') {
                    // add string
                    entry.from.push(from);
                } else {
                    // add array
                    entry.from.push(...from);
                }
            }
        }
    }

    clear() {
        this._mapping.clear();
        this._files = [];
    }

    empty() {
        return (this.size < 1);
    }

    forEach(fn) {
        let number = 0;
        this._mapping.forEach((value) => {
            if (value) fn(value.to, value.from, value.rule, number);
            number++;

        });
    }

    get(indexOrKey) {
        if (indexOrKey == null) return null;

        if (typeof indexOrKey === 'string') {
            // get dependencies for 'to'
            const to = indexOrKey;
            const from = this._mapping.get(to);
            return from;

        } else {
            if (indexOrKey >= 0 && indexOrKey < this._mapping.size) {
                const entries = Array.from(this._mapping.values());
                if (entries) {
                    return entries[indexOrKey];
                }
            }
        }

        return null;
    }

    getAsArray(to) {
        const entry = this._mapping.get(to);
        if (!entry || !entry.from) return [];
        const from = entry.from;
        if (typeof from === 'string') {
            return [ from ];
        } else {
            return from;
        }
    }

    clone() {
        const arr = [ ...this._files ];
        return arr;
    }

    array() {
        return this._files;
    }

    joinFrom() {
        const joined = [];
        const pairs = this._mapping;
        pairs.forEach((value, _number_) => {
            if (value && value.from) {
                if (typeof value.from === 'string') {
                    joined.push(value.from);
                } else {
                    value.from.forEach((from) => {
                        joined.push(from);
                    });
                }
            }
        });
        return joined;
    }

    joinTo() {
        const joined = [];
        const pairs = this._mapping;
        pairs.forEach((value, _number_) => {
            if (value && value.to) {
                if (typeof value.to === 'string') {
                    joined.push(value.to);
                } else {
                    value.to.forEach((to) => {
                        joined.push(to);
                    });
                }
            }
        });
        return joined;
    }

}


//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    ProjectItem: ProjectItem,
    TranslationList: TranslationList
}
