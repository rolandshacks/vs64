//
// Debug State
//

const path = require('path');
const DebugAdapter = require('@vscode/debugadapter');

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
            variablesCache.memory = await emu.readMemory(0x0000, 0xffff);
        }

        return variablesCache.memory;
    }

    async getChipState() {

        const variablesCache = this._variablesCache;

        if (!variablesCache.chipState) {
            const memorySnapshot = await this.getMemorySnapshot();
            variablesCache.chipState = ChipState.fromBytes(memorySnapshot);
        }

        return variablesCache.chipState;
    }

    async getBasicState() {
        const variablesCache = this._variablesCache;

        if (!variablesCache.basicState) {
            const memorySnapshot = await this.getMemorySnapshot();
            variablesCache.basicState = BasicState.fromBytes(memorySnapshot);
        }

        return variablesCache.basicState;

    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    DebugStateProvider: DebugStateProvider
}
