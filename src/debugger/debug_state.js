//
// Debug State
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { ChipState, BasicState } = require('debugger/debug');

//const { Logger } = require('utilities/logger');
//const logger = new Logger("DebugState");

//-----------------------------------------------------------------------------------------------//
// Debug Session
//-----------------------------------------------------------------------------------------------//

class DebugStateProvider {
    constructor(session) {
        this._session = session;
        this._variablesCache = {};
    }

    clearCache() {
        this._variablesCache = {};
    }

    getCpuState() {
        const variablesCache = this._variablesCache;
        if (!variablesCache.cpuState) {
            const emu = this._session._emulator;
            variablesCache.cpuState = emu.getCpuState();
        }

        return variablesCache.cpuState;
    }

    async getMemorySnapshot() {
        const variablesCache = this._variablesCache;
        if (!variablesCache.memory) {
            const emu = this._session._emulator;
            variablesCache.memory = await emu.getBufferedMemory();
        }

        return variablesCache.memory;
    }

    async getChipState() {

        const variablesCache = this._variablesCache;

        if (null == variablesCache.chipState) {
            const memorySnapshot = await this.getMemorySnapshot();
            variablesCache.chipState = ChipState.fromBuffer(memorySnapshot);
        }

        return variablesCache.chipState;
    }

    async storeChipState() {
        const variablesCache = this._variablesCache;
        if (null != variablesCache.chipState) {
            await variablesCache.chipState.flush();
        }
    }

    async getBasicState() {
        const variablesCache = this._variablesCache;

        if (!variablesCache.basicState) {
            const memorySnapshot = await this.getMemorySnapshot();
            variablesCache.basicState = BasicState.fromBuffer(memorySnapshot);
        }

        return variablesCache.basicState;

    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    DebugStateProvider: DebugStateProvider
};
