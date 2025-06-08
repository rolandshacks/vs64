//
// Test debug info
//

const path = require('path');

//-----------------------------------------------------------------------------------------------//
// Init module and lookup path
//-----------------------------------------------------------------------------------------------//

global._sourcebase = path.resolve(__dirname, "../src");
global.BIND = function(_module) {
    _module.paths.push(global._sourcebase);
};

BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { Logger, LogLevel } = require('utilities/logger');
const { DebugInfo } = require('debugger/debug_info');

const { Project } = require('project/project');
const { Settings } = require('settings/settings');

//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

function loggerSink(_txt_) {
}

describe('debug_info_acme', () => {
test("test debug info acme", async () => {

    Logger.setGlobalLevel(LogLevel.Trace);
    Logger.setSink(loggerSink);

    const settings = new Settings(null);
    const project = new Project(settings);

    const projectConfig = {
        name: "test",
        toolkit: "acme",
        sources: [ "src/main.c" ],
        build: "debug"
    };

    project.fromJson(JSON.stringify(projectConfig));
    const debugInfo = new DebugInfo(__context.resolve("/data/acmedebug.report"), project);
    expect(debugInfo).not.toBeNull();

    const _addressInfo = debugInfo.getAddressInfo(2070);

});

}); // describe

describe('debug_info_cc65', () => {
test("test debug info cc65", async () => {

    Logger.setGlobalLevel(LogLevel.Trace);
    Logger.setSink(loggerSink);

    const settings = new Settings(null);
    const project = new Project(settings);

    const projectConfig = {
        name: "test",
        toolkit: "cc65",
        sources: [ "src/main.asm" ],
        build: "debug"
    };

    project.fromJson(JSON.stringify(projectConfig));

    project.isSource = function(_filename) {
        return true;
    }

    const debugInfo = new DebugInfo(__context.resolve("/data/cc65debug.dbg"), project);
    expect(debugInfo).not.toBeNull();

    const _addressInfo = debugInfo.getAddressInfo(2070);

});

}); // describe
