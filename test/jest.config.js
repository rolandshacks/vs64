
const path = require("path");

const config = {
    globals: {},
    moduleDirectories: [
        "node_modules",
        path.join(__dirname, "../src"),
        path.join(__dirname, "../test/mockup")
    ],
    globalSetup: "<rootDir>/setup.js",
    verbose: true,
    testMatch: [ "<rootDir>/*.test.js" ],
    collectCoverageFrom: [ "<rootDir>/../**/*.js" ],
    coverageDirectory: "temp/coverage",
    coverageReporters: [ "text" ]
};

module.exports = config;
