/**
 * Utilities
 * @module Web
 */

/* global window */

const _HtmlElementMap = new Map();

/**
 * Get DOM element.
 * @param {string} id - The ID of the element to locate. The ID is a
 *                      case-sensitive string which is unique within the
 *                      document; only one element should have any given ID.
 * @returns {element} - An Element object describing the DOM element object
 *                      matching the specified ID, or null if no matching
 *                      element was found in the document.
 */
function $(id) {
    const m = _HtmlElementMap;

    let element = m.get(id);
    if (element) {
        return element;
    }

    element = document.getElementById(id); // eslint-disable-line no-undef
    if (element) {
        m.set(id, element);
    }

    return element;
}

/**
 * Helper functions.
 */
class Helpers {
    /**
     * Get quantified value.
     * @param {*} value - Reference value.
     * @param {*} quantum - Quantum size.
     * @returns
     */
    static getQuantified(value, quantum) {
        if (value % quantum) {
            value += (quantum - (value%quantum));
        }
        return value;
    }

    static getStereotype(nodeType) {
        if (null == nodeType) return null;

        if (nodeType.startsWith("components.")) {
            return nodeType.substring(11);
        }

        return nodeType;
    }

}

/**
 * Timer.
 */
class Timer {
    constructor(options) {
        this._handle = null;
        this._delay = null;
        this._active = false;
        this._fn = null;
        this._cyclic = false;
        this._options = options;
        this._args = null;
    }

    get delay() { return this._delay; }
    get cyclic() { return this._cyclic; }
    get active() { return this._active; }
    get options() { return this._options; }
    get args() { return this._args; }

    once(fn, delay, ...args) {
        this.#start(fn, delay, false, ...args);
    }

    cyclic(fn, delay, ...args) {
        this.#start(fn, delay, true, ...args);
    }

    stop() {
        this._active = false;

        if (this._handle != null) {
            window.clearTimeout(this._handle);
            this._handle = null;
        }
    }

    onTimer(..._args_) {}

    #start(fn, delay, cyclic, ...args) {
        this.stop();

        this._args = args;
        this._cyclic = cyclic;
        this._delay = delay;
        this._fn = fn;

        this.#restart();
    }

    #restart() {
        const thisInstance = this;
        this._active = true;
        this._handle = window.setTimeout(() => {
            thisInstance.#timer();
        }, this._delay);
    }

    #timer() {
        if (!this._active) {
            return;
        }

        if (this._fn) {
            this._fn(...this._args);
        } else {
            this.onTimer(...this._args);
        }

        if (this._active && this._cyclic) {
            this.#restart();
        } else {
            this.stop();
        }
    }
}

/**
 * Tree scope.
 */
class TreeScope {
    constructor(jsonNode, parentScope) {
        this.node = jsonNode;
        this.parent = parentScope;
        this.name = jsonNode.name || "";
        this.path = (null != parentScope && null != parentScope.path) ? parentScope.path + (parentScope.path.length > 0 ? "." : "") + this.name : "";
        this.result = null;
    }
}

/**
 * Tree.
 */
class Tree {

    static traverse(json, visitFn) {
        const stack = [];
        stack.push(new TreeScope(json));
        Tree.traverseNode(visitFn, stack);
    }

    static traverseNode(visitFn, stack) {

        const scope = stack[stack.length-1];
        const jsonNode = scope.node;

        scope.result = visitFn(scope);

        if (null == jsonNode.children) return;

        for (const childNode of Object.values(jsonNode.children)) {
            const childScope = new TreeScope(childNode, scope);
            stack.push(childScope);
            this.traverseNode(visitFn, stack);
            stack.pop();
        }
    }

    static getLinkPath(json, separator) {
        if (null == json) return null;
        let link = json.link;
        if (null == link) link = json;
        return link.join(separator || '.');
    }

    static getElkPath(json, ofs) {
        if (null == json) return null;
        let link = json.link;
        if (null == link) link = json;

        if (null == ofs) ofs = 1; // skip root
        let s = "";
        for (let i=ofs; i<link.length; i++) {
            if (s.length > 0) s += ".";
            s += link[i];
        }

        return s;
    }
}

export {
    $,
    Timer,
    Helpers,
    Tree
}
