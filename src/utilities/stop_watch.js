//
// Stop Watch
//

const process = require("process");

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

//-----------------------------------------------------------------------------------------------//
// Stop Watch
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
    StopWatch: StopWatch
};
