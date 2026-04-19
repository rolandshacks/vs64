
const path = require("path");

const config = {
    globals: {},
    moduleDirectories: [
        "node_modules",
        path.join(__dirname, "./src"),
        path.join(__dirname, "./mockup")
    ],
    globalSetup: "<rootDir>/test/setup.js",
    verbose: true,
    testMatch: [
        "<rootDir>/test/*.test.js",
        "<rootDir>/packages/**/test/*.test.js"
    ],
    collectCoverageFrom: [ "<rootDir>/**/*.js" ],
    coverageDirectory: "build/coverage",
    coverageReporters: [ "text" ]
};

module.exports = config;
