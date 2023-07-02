//
// Ninja
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { ArgumentList } = require('utilities/args');

function _firstCharIndexOf_(str, chars, pos) {
    if (!str || str.length < 1) return null;
    if (!chars || chars.length < 1) return null;

    if (pos < 0) pos += str.length - 1;

    for (let i=pos; i<str.length; i++) {
        const c = str[i];
        const pos = chars.indexOf(c);
        if (pos >= 0) return pos;
    }

    return -1;
}

class Ninja {

    static build(to, from, rule) {
        return "build " + Ninja.escape(to) + ": " + rule + " " + Ninja.escape(from);
    }

    static keyValueRaw(key, value) {
        return key + " = " + value;
    }

    static keyValue(key, value) {
        return key + " = " + Ninja.escape(value);
    }

    static keyArgs(key, args) {
        return key + " = " + args.join();
    }

    static escape(s, quoted) {

        if (!s) return s;

        let esc = "";

        if (quoted) esc += "\"";

        for (const c of s) {
            if (c == ':') esc += "$:"
            else if (c == ' ') esc += "$ "
            else if (c == '$') esc += "$$"
            else esc += c;
        }

        if (quoted) esc += "\"";

        return esc;
    }

    static quote(s) {
        return "\"" + s + "\"";
    }

    static escapeQuotedIfNeeded(s) {
        if (!s || s.length < 1) return s;

        const quoted = (s.indexOf(" ") >= 0);

        return this.escape(s, quoted);
    }

    static join(elements, quotesIfNeeded) {
        if (!elements || elements.length < 1) return "";

        let s = "";
        const separator = " ";

        for (let i=0; i<elements.length; i++) {
            const element = elements[i];
            if (i>0 && separator) s += separator;

            const quoted = (quotesIfNeeded ? (element.indexOf(" ") >= 0) : false);
            const value = Ninja.escape(element);

            s += (quoted ? "\"" + value + "\"" : value);

        }

        return s;
    }
}

class NinjaArgs extends ArgumentList {
    constructor(...args) {
        super(...args);
    }

    join(prefix, suffix) {
        const result = super.join((s) => {
            if (s.indexOf(" ") >= 0) return Ninja.escape(s, true);
            else if (s.indexOf(":") >= 0) return Ninja.escape(s);
            return s;
        }, prefix, suffix);

        return result;
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Ninja: Ninja,
    NinjaArgs: NinjaArgs
}
