//
// VS64 Bundle Script
//

const path = require('path');
const fs = require('fs');
const process = require('process');
const esbuild = require('esbuild');

global._sourcebase = path.resolve(__dirname, "src");
const BIND = function (_module) { _module.paths.push(global._sourcebase); };
global.BIND = BIND
BIND(module);

const config = {
    entryPoints: ['src/extension/extension.js'],
    bundle: true,
    outfile: 'dist/vs64.js',
    external: ['vscode'],
    format: "cjs",
    platform: "node",
    nodePaths: [ global._sourcebase ]
};

esbuild.build(config)
    .then(() => { console.log("done"); })
    .catch(() => { console.error("failed"); process.exit(1); });
