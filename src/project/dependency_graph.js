//
// Graph
//

const fs = require('fs');
const path = require("path");

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

const logger = new Logger("Graph");

//-----------------------------------------------------------------------------------------------//
// Dependency Graph Node
//-----------------------------------------------------------------------------------------------//

class DependencyGraphNode {
    constructor(id) {

        this._id = id;
        this._dependencies = null;
        this._dependants = null;
    }

    get id() { return this._id; }

    setId(id) { this._id = id; }

    clear() {
        this._dependencies = null;
        this._dependants = null;
    }

    isValid() {
        return (this._id && this._id.length > 0);
    }

    hasDependencies() {
        return this._dependencies != null;
    }

    hasDependants() {
        return this._dependants != null;
    }

    addDependency(node) {

        if (!node || !node.isValid()) return null;

        if (!this._dependencies) {
            this._dependencies = new Map();
        }

        if (!this._dependencies.has(node.id)) {
            this._dependencies.set(node.id, node);
        }

        node.addDependant(this);

        return node;
    }

    addDependant(dependant) {

        if (!dependant) return null;

        if (!this._dependants) {
            this._dependants = new Map();
        }

        if (!this._dependants.has(dependant.id)) {
            this._dependants.set(dependant.id, dependant);
        };

        return dependant;
    }

    removeDependant(node) {
        if (this.hasDependants()) {
            if (this._dependants.delete(node.id));
            if (this._dependants.size == 0) {
                this._dependants = null;
            }
        }
    }

    removeDependency(node) {
        if (this.hasDependencies()) {
            this._dependencies.delete(node.id);
            if (this._dependencies.size == 0) {
                this._dependencies = null;
            }
        }
    }

    remove(node) {
        if (this.hasDependencies()) {
            this.removeDependency(node);
            node.removeDependant(this);
        }

        if (node.hasDependencies()) {
            const dependencies = node.getDependencies();
            for (const dependency of dependencies) {
                dependency.removeDependant(node);
            }
            node._dependencies = null;
        }

        if (node.hasDependants()) {
            const dependants = node.getDependants();
            for (const dependant of dependants) {
                dependant.removeDependency(node);
            }
            node._dependants = null;
        }
    }

    find(id) {
        if (this.id == id) return this;
        const adjacentNode = this.#bfs(
            (node) => { return node.getDependencies(); },
            (node) => { return node.id == id; },
            true
        );
        return adjacentNode;
    }

    findDependant(id) {
        if (this.id == id) return this;
        const adjacentNode = this.#bfs(
            (node) => { return node.getDependants(); },
            (node) => { return node.id == id; },
            true
        );
        return adjacentNode;
    }

    getDependencies() {
        if (!this._dependencies) return null;
        return this._dependencies.values();
    }

    getDependants() {
        if (!this._dependants) return null;
        return this._dependants.values();
    }

    findDependants(resultSet) {
        const refs = this.getDependants();
        if (!refs) return null;

        const refList = [...refs];

        let isFirst = false;

        if (!resultSet) {
            isFirst = true;
            resultSet = new Set();
        }

        for (const ref of refList) {
            if (!resultSet.has(ref)) {
                resultSet.add(ref);
            }
        }

        for (const ref of refList) {
            ref.findDependants(resultSet);
        }

        if (isFirst) {
            return resultSet.values();
        }
    }

    visit(visitor) {
        this.#bfs(
            (node) => { return node.getDependencies(); },
            (node) => { visitor(node); return false; },
            false
        );
    }

    #bfs(collector, filter, findFirst) {
        const queue = [];
        const markers = new Set();

        let foundNodes = null;

        queue.push(this);

        while (queue.length > 0) {
            const node = queue.shift();

            if (!filter || filter(node) == true) {
                if (findFirst) return node;
                if (!foundNodes) foundNodes = [];
                foundNodes.push(node);
            }

            const adjacents = collector(node);
            if (adjacents) {
                for (const adjacentNode of adjacents) {
                    if (!markers.has(adjacentNode.id)) {
                        markers.add(adjacentNode.id);
                        queue.push(adjacentNode);
                    }
                }
            }

        }

        return foundNodes;
    }

}

//-----------------------------------------------------------------------------------------------//
// DependencyGraph
//-----------------------------------------------------------------------------------------------//

class DependencyGraph extends DependencyGraphNode {
    constructor(id) {
        super(id || "<root>");
    }

    dump() {
        const nodes = [];
        this.visit((node) => { nodes.push(node); });

        for (const node of nodes) {
            console.log(node.id);
            if (node.hasDependencies()) {
                const dependencies = node.getDependencies();
                for (const dependency of dependencies) {
                    console.log("  - " + dependency.id);
                }
            }
        }
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    DependencyGraph: DependencyGraph,
    DependencyGraphNode: DependencyGraphNode
}
