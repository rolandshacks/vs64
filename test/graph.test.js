//
// Test basics
//

const assert = require('assert');
const path = require('path');

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
const { DependencyGraph, DependencyGraphNode } = require('project/dependency_graph');
const { Logger, LogLevel } = require('utilities/logger');

const logger = new Logger("TestGraph");

describe('graph', () => {
test("graph_basics", () => {

    const graph = new DependencyGraph();


}); // test

});  // describe
