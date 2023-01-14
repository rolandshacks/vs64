//
// Standalone runner
//

const path = require('path');
const fs = require('fs');

//-----------------------------------------------------------------------------------------------//
// Init module and lookup path
//-----------------------------------------------------------------------------------------------//

global._sourcebase = path.resolve(__dirname, "../src");
global.BIND = function(_module) {
    _module.paths.push(global._sourcebase);
};

// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { Logger, LogLevel } = require('utilities/logger');
const { Project } = require('project/project');
const { Build, BuildType } = require('builder/builder');
const { DebugInfo } = require('debugger/debug_info');

const logger = new Logger("BuilderRun");

const settings = {
    acmeExecutable: "C:/tools/c64/acme/acme",
    cc65Executable: "C:/tools/c64/cc65/bin/cc65",
    ca65Executable: "C:/tools/c64/cc65/bin/ca65",
    ld65Executable: "C:/tools/c64/cc65/bin/ld65"
};

const project = new Project(settings);

async function build() {
    let projectFile = path.resolve("project-config.json");
    console.log(projectFile);

    project.fromFile(projectFile);

    const build = new Build(project);
    build.onBuildOutput(txt => {
        console.log(txt);
    });
    build.clean();
    const result = await build.build();
}

async function debug() {

    let debugInfoPath = project.outdebug;

    this._debugInfo = new DebugInfo(debugInfoPath, project);

}

async function main() {
    Logger.setGlobalLevel(LogLevel.Trace);

    await build();
    await debug();
}

main();
