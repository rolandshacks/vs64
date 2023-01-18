//
// Profiler
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { Logger } = require('utilities/logger');

const logger = new Logger("Profiler");

//-----------------------------------------------------------------------------------------------//
// Profiler
//-----------------------------------------------------------------------------------------------//
class Profiler {
    constructor(runner) {
        this._runner = runner;
    }

    get cycles() {
        return this._cycles;
    }

    get cyclesDelta() {
        return this._cyclesDelta;
    }

    get cpuTimeDelta() {
        const cycles = this._cyclesDelta;

        let s = null;

        if (cycles >= 1000000) {
            const sec = Math.floor(cycles / 100000) / 10;
            s = "" + sec + "s";

        } else if (cycles >= 500) {
            const msec = Math.floor(cycles / 100) / 10;
            s = "" + msec + "ms";

        } else {
            s = "" + cycles + "us";
        }

        return s;
    }

    reset() {
        const cpuState = this._runner.getCpuState();
        this._cycles = cpuState.cpuInfo.cycles;
        this._cyclesDelta = 0;
    }

    update() {
        const cpuState = this._runner.getCpuState();

        const lastCycles = this._cycles;

        this._cycles = cpuState.cpuInfo.cycles;
        this._cyclesDelta = this._cycles - lastCycles;

    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Profiler: Profiler
}
