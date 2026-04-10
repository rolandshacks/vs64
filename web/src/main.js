/**
 * main
 * @module Web
 */

import { Application } from "./app.js";
import { TestBench } from "./testbench.js";

export function main(config) {
    new Application(config);
}

export function testmain(config) {
    new TestBench(config).run();
}
