//
// Test basics
//

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { fstat } = require('fs');

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

const logger = new Logger("TestBuilder");

//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

let lastLoggerOutputLine = null;

function loggerSink(txt) {
    lastLoggerOutputLine = txt;
}

describe('builder', () => {
test("test builder", async () => {

    Logger.setGlobalLevel(LogLevel.Trace);
    Logger.setSink(loggerSink);

    const settings = {
        acmeExecutable: "C:/tools/c64/acme/acme"
    };

    let projectFile = path.resolve("project-config.json");
    console.log(projectFile);

    const project = new Project(settings);
    project.fromFile(projectFile);

    expect(project.name).not.toHaveLength(0);
    expect(project.sources).not.toHaveLength(0);
    expect(project.basedir).not.toHaveLength(0);
    expect(project.builddir).not.toHaveLength(0);
    expect(project.buildfile).not.toHaveLength(0);
    expect(project.compilecommandsfile).not.toHaveLength(0);
    expect(project.cpppropertiesfile).not.toHaveLength(0);
    expect(project.configfile).not.toHaveLength(0);
    expect(project.outfile).not.toHaveLength(0);

    const build = new Build(project);
    build.clean();
    const result = await build.build();
    expect(result).not.toBeNull();

});

});
