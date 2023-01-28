//
// Standalone runner
//

const path = require('path');
const fs = require('fs');

//-----------------------------------------------------------------------------------------------//
// Init module and lookup path
//-----------------------------------------------------------------------------------------------//

global._sourcebase = path.resolve(__dirname, "../src");
global.BIND = function (_module) {
    _module.paths.push(global._sourcebase);
};

// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { Logger, LogLevel } = require('utilities/logger');
const { DependencyGraph, DependencyGraphNode } = require('project/dependency_graph');

const logger = new Logger("GraphRun");


//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

/*
        G
      /   \
     /     \
    a       x
    |  \   /  \
    |   \ /    \
    b    c      y
    |   / \      \
    |  /   \      \
    d       e      z

    a
    b
    c
    d
    e

*/

function dump(graph) {
    console.log("---------------------------------------------");

    graph.dump();
}

function dumpList(nodes) {
    console.log("---------------------------------------------");

    for (const node of nodes) {
        console.log(node.id);
    }

}

function runGraph() {

    const graph = new DependencyGraph("root");

    {
        const a = graph.addDependency(new DependencyGraphNode("a"))

        const b = a.addDependency(new DependencyGraphNode("b"));
        const c = a.addDependency(new DependencyGraphNode("c"));

        const d = b.addDependency(new DependencyGraphNode("d"));
        c.addDependency(d);

        const e = c.addDependency(new DependencyGraphNode("e"));

        const x = graph.addDependency(new DependencyGraphNode("x"))
        const y = x.addDependency(new DependencyGraphNode("y"))
        const z = y.addDependency(new DependencyGraphNode("z"))

        x.addDependency(c);

        dump(graph);
    }

    {
        graph.visit((node) => {
            node.flag = true;
        });
    }

    {
        const d = graph.find("d");
        const dependants = d.findDependants();
        dumpList(dependants);
    }

    {
        const a = graph.find("a");
        graph.remove(a);
        dump(graph);
    }

    {
        const d = graph.find("d");
        const dependants = d.findDependants();
        dumpList(dependants);
    }

}

function main() {
    Logger.setGlobalLevel(LogLevel.Trace);

    runGraph();
}

main();
