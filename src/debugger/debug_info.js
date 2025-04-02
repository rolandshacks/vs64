//
// Debug Info
//

const path = require('path');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

//const { Logger } = require('utilities/logger');

const { Utils } = require('utilities/utils');
const { SortedArray } = require('utilities/sorted_array');
const { DebugSymbol } = require('debugger/debug_info_types');
const { BasicDebugInfo } = require('debugger/debug_info_basic');
const { Cc65DebugInfo } = require('debugger/debug_info_cc65');
const { Oscar64DebugInfo } = require('debugger/debug_info_oscar64');
const { AcmeDebugInfo } = require('debugger/debug_info_acme');
const { KickDebugInfo } = require('debugger/debug_info_kick');
const { ElfDebugInfo } = require('debugger/debug_info_elf');

class DebugInfo {

    constructor(filename, project) {

        this._labels = null;
        this._symbols = null;
        this._symbolMap = null;
        this._memblocks = null;
        this._spans = null;
        this._addresses = [];
        this._lineListByFile = new Map();
        this._supportsScopes = null;
        this._timestamp = null;
        this._filename = null;
        this._functions = null;
        this._objects = null;

        // using array instead of map for
        // real constant time access
        // (whereas hashing might be a problem)
        this._addressMap = new Array(0x1000);

        this.#load(filename, project);
    }

    get timestamp() {
        return this._timestamp;
    }

    get filename() {
        return this._filename;
    }

    get supportsScopes() {
        return (this._supportsScopes == true);
    }

    get memblocks() {
        return this._memblocks;
    }

    storeMemBlock(memblock) {
        if (null == this._memblocks) {
            this._memblocks = [ memblock ];
        } else {
            this._memblocks.push(memblock);
        }

        this.storeObject(memblock);
    }

    get hasMemBlocks() {
        return (this._memblocks && this._memblocks.length > 0);
    }

    storeObject(obj) {
        if (null == obj) return;

        if (null == this._objects) {
            this._objects = [ obj ];
        } else {
            this._objects.push(obj);
        }

        obj.refId = this._objects.length - 1;
    }

    storeFunction(func) {
        if (null == this._functions) {
            this._functions = [ func ];
        } else {
            this._functions.push(func);
        }

        func.index = this._functions.length - 1;

        this.storeObject(func);
    }

    get hasFunctions() {
        return (this._functions && this._functions.length > 0);
    }

    get hasAddresses() {
        return (this._addresses && this._addresses.length > 0);
    }

    getFunctionByAddr(addr) {
        if (!this.hasFunctions) return null;

        for (const functionInfo of this._functions) {
            if (addr >= functionInfo.address && addr <= functionInfo.address_end) {
                return functionInfo;
            }
        }

        return null;
    }

    #load(filename, project) {

        const toolkit = project.toolkit;
        if (null == toolkit) return;

        const debugInfoType = filename != null ? path.extname(filename).toLowerCase() : null;

        if (toolkit.isBasic) {
            BasicDebugInfo.load(this, project, filename);
        } else if (debugInfoType == ".report") {
            AcmeDebugInfo.load(this, project, filename);
        } else if (debugInfoType == ".elf") {
            ElfDebugInfo.load(this, project, filename);
        } else if (debugInfoType == ".dbj") {
            Oscar64DebugInfo.load(this, project, filename);
        } else if (debugInfoType == ".dbg") {
            if (toolkit.isKick) {
                KickDebugInfo.load(this, project, filename);
            } else {
                Cc65DebugInfo.load(this, project, filename);
            }
        }

        this.#resolve();

        this._filename = filename;
        this._timestamp = Utils.getFileTime(filename);
    }

    #resolve() {
        this._symbols = null;

        if (this._symbolMap) {
            this._symbols = [];
            for (const symbol of this._symbolMap.values()) {
                this._symbols.push(symbol);
                symbol.index = this._symbols.length - 1;
            }
        }
    }

    getOrCreateLineList(filename) {
        let list = this._lineListByFile.get(filename);

        if (null == list) {
            list = new SortedArray({
                key: (a) => { return a.line; }
            });
            this._lineListByFile.set(filename, list);
        }

        return list;
    }

    storeLabel(label) {
        if (!this._labels) this._labels = new Map();
        this._labels.set(label.name, label);
    }

    get hasSymbols() {
        return this._symbols != null && this._symbols.length > 0;
    }

    storeSymbol(symbol) {
        if (!this._symbolMap) this._symbolMap = new Map();
        this._symbolMap.set(symbol.name, symbol);
        this.storeObject(symbol);
    }

    getRefName(filename) {
        return Utils.normalizePath(filename);
    }

    get symbols() {
        return this._symbols;
    }

    getSymbol(name) {
        let elements = this._symbolMap;
        if (!elements) return null;
        return elements.get(name);
    }

    getSymbolByIndex(idx) {
        if (null == this._symbols || idx == null || idx < 0 || idx >= this._symbols.length) {
            return null;
        }

        return this._symbols[idx];
    }

    getLabel(name) {
        let elements = this._labels;
        if (!elements) return null;
        return elements.get(name);
    }

    getAddressInfo(addr) {
        if (addr < 0 || addr >= this._addressMap.length) {
            return null;
        }
        return this._addressMap[addr];
    }

    setSpans(spans) {
        this._spans = spans;
    }

    getScopes(addr) {
        if (!this.supportsScopes) return null;

        const addrInfo = this.getAddressInfo(addr);
        if (!addrInfo) return null;

        const span = addrInfo.span;
        if (!span) return null;

        const spans = this._spans;
        let spanIdx = spans.indexOf(span);
        if (spanIdx < 0) return null;

        while (spanIdx >= 0) {
            const s = spans.get(spanIdx);
            if (s.scopeInfos) {
                return s.scopeInfos; // just grab first
            }
            spanIdx--;
        }

        return null;
    }

    getScopeName(addr) {
        if (!this.supportsScopes) return null;

        const scopes = this.getScopes(addr);
        if (!scopes) return null;

        for (const scope of scopes) {
            if (!scope.csymInfos) continue;
            for (const csymInfo of scope.csymInfos) {
                if (csymInfo.sc == "ext" && csymInfo.type == 0) {
                    return csymInfo.name;
                }
            }
        }

        return null;
    }

    getScopedSymbol(addr, symbolName) {
        if (!this.supportsScopes) return null;

        const scopes = this.getScopes(addr);
        if (!scopes) return null;

        let symbol = null;

        for (const scope of scopes) {
            if (!scope.csymInfos) continue;

            for (const csymInfo of scope.csymInfos) {
                if (csymInfo.sc != "auto" || csymInfo.type != 0) continue;
                if (csymInfo.name == symbolName) {
                    const relativeAddress = csymInfo.offs ? parseInt(csymInfo.offs) : 0;
                    symbol = new DebugSymbol(symbolName, relativeAddress, true);
                    break;
                }
            }

        }

        return symbol;
    }

    findNextLine(addr) {
        const addressInfo = this.getAddressInfo(addr);
        if (!addressInfo) return null;

        const moduleRef = addressInfo.localRef;
        const moduleTable = addressInfo.localRefTable;
        if (!moduleTable || null == moduleRef || moduleRef >= moduleTable.length-1) {
            return null;
        }

        return moduleTable[moduleRef+1];
    }

    findNearestCodeLine(filename, line) {
        const normalizedPath = this.getRefName(filename);

        const lineListByFile = this._lineListByFile;
        if (!lineListByFile) return null;

        const lineList = this._lineListByFile.get(normalizedPath);
        if (!lineList) return null;

        const pos = lineList.indexOf(line);
        if (pos < 0) return null;

        const foundAddr = lineList.get(pos);

        return foundAddr;
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    DebugInfo: DebugInfo
}
