//
// Cache
//

const path = require('path');
const fs = require('fs');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { Utils } = require('utilities/utils');
const { Logger } = require('utilities/logger');
const logger = new Logger("Cache");

//-----------------------------------------------------------------------------------------------//
// Arguments
//-----------------------------------------------------------------------------------------------//

class FileCache {
    constructor(computeFunction, keyFunction) {
        this._entries = new Map();
        this._computeFunction = computeFunction;
        this._keyFunction = keyFunction;
    }

    clear() {
        logger.trace("clear file cache");
        this._entries.clear();
    }

    get(filename, options) {
        const normalizedFilename = Utils.normalizePath(filename);
        const filetime = Utils.getFileTime(normalizedFilename);
        const key = this._key(normalizedFilename, options);

        logger.trace("get file cache: " + key);

        let entry = this._entries.get(key);

        let needsCompute = (null == entry);
        if (entry && filetime > entry.filetime) needsCompute = true;

        if (!needsCompute) return entry.data;

        logger.trace("create file cache: " + key);

        const data = this._compute(normalizedFilename, options);
        if (null == data) {
            if (null != entry) {
                this._entries.delete(key);
            }
            return null;
        }

        if (null == entry) {
            entry = {
                filename: normalizedFilename,
                key: key
            };

            this._entries.set(key, entry);
        }

        entry.filetime = filetime;
        entry.data = data;

        return data;
    }

    _compute(filename, options) {
        return this._computeFunction(filename, options);
    }

    _key(filename, options) {
        if (this._keyFunction) {
            return this._keyFunction(filename, options);
        } else {
            return filename;
        }
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    FileCache: FileCache
};
