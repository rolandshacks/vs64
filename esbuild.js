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

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const baseDir = __dirname;
const srcDir = path.join(__dirname, 'src');
const outDir = path.join(__dirname, 'dist');

async function main() {
    const ctx = await esbuild.context({
        entryPoints: [ 
            path.join(srcDir, 'extension/main.js')
        ],
        outfile: path.join(outDir, "vs64.js"),
        bundle: true,
        format: "cjs",
        minify: production,
        sourcesContent: false,
        platform: 'node',
        external: ['vscode'],
        logLevel: 'debug',
        nodePaths: [global._sourcebase],
        sourcemap: 'linked',
        plugins: [
            esbuildProblemMatcherPlugin
        ]
    });

    if (watch) {
        await ctx.watch();
    } else {
        await ctx.rebuild();
        await ctx.dispose();
    }
}

const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',

    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started');
        });
        build.onEnd(result => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                if (location == null) return;
                console.error(`    ${location.file}:${location.line}:${location.column}:`);
            });
            console.log('[watch] build finished');
        });
    }
};

main().catch(e => {
    console.error(e);
    process.exit(1);
});
