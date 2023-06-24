
const path = require("path");

const config = {
    verbose: true,
    moduleDirectories: ["node_modules", path.join(__dirname, "../src"), path.join(__dirname, "../test/mockup") ],
};

module.exports = config;
