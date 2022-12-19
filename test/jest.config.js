
const path = require("path");

const config = {
    verbose: true,
    moduleDirectories: ["node_modules", path.join(__dirname, "../src")],
};

module.exports = config;
