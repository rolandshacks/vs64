//
// Standalone runner
//

const path = require('path');

//-----------------------------------------------------------------------------------------------//
// Init module and lookup path
//-----------------------------------------------------------------------------------------------//

global._sourcebase = path.resolve(__dirname, "../../src");
global._mockup = path.resolve(__dirname, "../mockup");
global.BIND = function (_module) {
    _module.paths.push(global._mockup);
    _module.paths.push(global._sourcebase);
};

// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { Logger, LogLevel } = require('logger/logger');
const { PackageManager } = require('packman/packman');

//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

function onProgress(progressInfo, asset) {
    const percent = Math.floor(progressInfo.percent);
    console.log(asset.name + ": " + percent + "%");
}

async function runPackman() {

    const appName = "VS64DevTools";

    const userAppDir = PackageManager.getUserAppDir(appName);

    //const baseUrl = "http://192.168.2.2/vs64pack";
    const baseUrl = "https://github.com/rolandshacks/vs64devtools";
    const packageManager = new PackageManager(appName, baseUrl, null, onProgress);

    await packageManager.connect();

    const assets = packageManager._remoteManifest.getGroupAssets(PackageManager.getDefaultGroups());

    for (const asset of assets) {
        const assetInfo = packageManager.getAssetInstallInfo(asset);
        if (!assetInfo) continue;
        console.log("asset:" + assetInfo.name);
        console.log("    install dir: " + assetInfo.installDir);
        console.log("    source url: " + assetInfo.sourceUrl);
    }

    packageManager.uninstallAll();
    //await packageManager.update();
    await packageManager.install();

    console.log("DONE");
}

function main() {
    Logger.setGlobalLevel(LogLevel.Trace);
    runPackman();
}

main();
