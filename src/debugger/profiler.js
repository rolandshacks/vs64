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
        this._cycles = cpuState ? cpuState.cpuInfo.cycles : 0;
        this._cyclesDelta = 0;
    }

    update() {
        const lastCycles = this._cycles;
        const cpuState = this._runner.getCpuState();
        this._cycles = cpuState ? cpuState.cpuInfo.cycles : 0;
        this._cyclesDelta = this._cycles - lastCycles;
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Profiler: Profiler
}
