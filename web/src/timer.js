/**
 * Timer
 * @module Web
 */

/* global window */

/**
 * Timer.
 */
class Timer {
    constructor(options) {
        this._handle = null;
        this._delay = null;
        this._active = false;
        this._fn = null;
        this._is_cyclic = false;
        this._options = options;
        this._args = null;
    }

    get delay() { return this._delay; }
    get is_cyclic() { return this._is_cyclic; }
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

    #start(fn, delay, cycleTime, ...args) {
        this.stop();

        this._args = args;
        this._is_cyclic = cycleTime;
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

        if (this._active && this._is_cyclic) {
            this.#restart();
        } else {
            this.stop();
        }
    }
}

export {
    Timer
}
