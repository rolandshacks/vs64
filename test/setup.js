//
// Global Test Setup
//

const path = require("path");
const process = require('process');

//-----------------------------------------------------------------------------------------------//
// Test Context
//-----------------------------------------------------------------------------------------------//

class TestContext {

    constructor(rootDir) {

        this.cwd = process.cwd();
        this.rootDir = rootDir;
        this.tempDir = path.resolve(this.rootDir, "temp");
        this.dataDir = path.resolve(this.rootDir, "data");

        this.#exportInterface();
    }

    #exportInterface() {
        this.resolve = function(relPath) {
            if (!relPath) return relPath;

            let resolvedPath = null;
            if (relPath.startsWith("/temp/")) {
                resolvedPath = path.resolve(this.tempDir, relPath.substring(6));
            } else if (relPath.startsWith("/data/")) {
                resolvedPath = path.resolve(this.dataDir, relPath.substring(6));
            } else {
                resolvedPath = path.resolve(this.rootDir, relPath);
            }

            return resolvedPath;
        };
    }

}

//-----------------------------------------------------------------------------------------------//
// Global setup function
//-----------------------------------------------------------------------------------------------//

function setup (globalConfig, projectConfig) {
    if (!projectConfig.globals) projectConfig.globals = {};
    projectConfig.globals.__context = new TestContext(globalConfig.rootDir);
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = setup;
