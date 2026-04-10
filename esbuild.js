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
const webDir = path.join(__dirname, 'web');
const outDir = path.join(__dirname, 'dist');

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

const extensionBuild = {
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
};

const webBuild = {
    entryPoints: [
        path.join(webDir, 'src/main.js')
    ],
    outfile: path.join(outDir, "web.js"),
    bundle: true,
    format: "esm",
    minify: production,
    sourcesContent: false,
    platform: 'browser',
    external: ['vscode'],
    logLevel: 'debug',
    sourcemap: 'linked',
    loader: {
        '.css': 'css',
        '.svg': 'dataurl',
        '.png': 'file'
    },
    plugins: [
        esbuildProblemMatcherPlugin
    ]
};

async function main() {
    const ctx1 = await esbuild.context(extensionBuild);
    const ctx2 = await esbuild.context(webBuild);

    if (watch) {
        await Promise.all([ctx1.watch(), ctx2.watch()]);
    } else {
        await ctx1.rebuild();
        await ctx1.dispose();

        await ctx2.rebuild();
        await ctx2.dispose();
    }
}

async function main1() {
    const ctx = await esbuild.context(extensionBuild);

    if (watch) {
        await ctx.watch();
    } else {
        await ctx.rebuild();
        await ctx.dispose();
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
