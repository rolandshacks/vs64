//
// Package Manager test
//

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { PackageManager } = require('packman/packman');

//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

describe('packman', () => {
    test("packman_basics", async () => {

        const appName = "TestVS64Pack";

        const userAppDir = PackageManager.getUserAppDir(appName);
        expect(userAppDir).not.toBe(null);

        const baseUrl = "http://192.168.2.2/vs64pack";
        const packageManager = new PackageManager(appName, baseUrl);

        await packageManager.connect();

        const assets = packageManager._remoteManifest.getGroupAssets(["win"]);
        expect(assets).not.toBe(null);

        console.log("assets:" + assets);

        packageManager.uninstallAll();
        await packageManager.install();

    });

});  // describe
