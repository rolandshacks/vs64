//
// Package Manager test
//

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { PackageManager } = require('packman/packman');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const symlinkTest = process.platform === 'win32' ? test.skip : test;
const unixTest = process.platform === 'win32' ? test.skip : test;

const ZIP_FIXTURE = Buffer.from(
    'UEsDBBQAAAgIAMW6Y10PmMiNCgAAAAgAAAANAAAAZGVtby9iaW4vdG9vbKvKLFAoyc/PAQBQSwECFAMUAAAICADFumNdD5jIjQoAAAAIAAAADQAAAAAAAAAAAAAApIEAAAAAZGVtby9iaW4vdG9vbFBLBQYAAAAAAQABADsAAAA1AAAAAAA=',
    'base64'
);
const UNWRAPPED_ZIP_FIXTURE = Buffer.from(
    'UEsDBBQAAAAIAHl0ZF0PmMiNCgAAAAgAAAAIAAAAYmluL3Rvb2yryixQKMnPzwEAUEsBAhQDFAAAAAgAeXRkXQ+YyI0KAAAACAAAAAgAAAAAAAAAAAAAAIABAAAAAGJpbi90b29sUEsFBgAAAAABAAEANgAAADAAAAAAAA==',
    'base64'
);
const ACME_ZIP_FIXTURE = Buffer.from(
    'UEsDBBQAAAAIAEZ2ZF0UW1uBCwAAAAkAAAAVAAAAYWNtZTAuOTd3aW4vYWNtZS90b29sS0zOTVUoyc/PAQBQSwECFAMUAAAACABGdmRdFFtbgQsAAAAJAAAAFQAAAAAAAAAAAAAAgAEAAAAAYWNtZTAuOTd3aW4vYWNtZS90b29sUEsFBgAAAAABAAEAQwAAAD4AAAAAAA==',
    'base64'
);
const TAR_XZ_MODE_FIXTURE = Buffer.from(
    '/Td6WFoAAATm1rRGAgAhARYAAAB0L+Wj4Cf/AJBdADkZSdrpOaPtMVBzq4P0BFGeZw29PNCqAcNkfvYJR5okyDO6YlsIulWfn3jtxuiSeaoqDMjYcNxukqlewAPdsuahTj0ZMtqYBOAJyVKwdYup9Jne35aKnW3kYNghVceYckr0Fn4DSnXqpdhyAXCj7SpRfyWkyxbg4jYZywa0jRImEjuIItIqrrFhWoOzE0NbAADQmkTxbnUy0wABrAGAUAAAc7QOEbHEZ/sCAAAAAARZWg==',
    'base64'
);

function makeTar(entries) {
    const blocks = [];
    for (const { name, data = '', type = '0', linkName = '', mode = type === '5' ? 0o755 : 0o644 } of entries) {
        const content = Buffer.from(data);
        const header = Buffer.alloc(512);
        header.write(name, 0, 100);
        header.write(mode.toString(8).padStart(7, '0') + '\0', 100, 8);
        header.write('0000000\0', 108, 8);
        header.write('0000000\0', 116, 8);
        header.write(content.length.toString(8).padStart(11, '0') + '\0', 124, 12);
        header.write('00000000000\0', 136, 12);
        header.fill(32, 148, 156);
        header.write(type, 156, 1);
        header.write(linkName, 157, 100);
        header.write('ustar\0', 257, 6);
        header.write('00', 263, 2);
        header.write((header.reduce((sum, byte) => sum + byte, 0)).toString(8).padStart(6, '0') + '\0 ', 148, 8);
        blocks.push(header, content, Buffer.alloc((512 - content.length % 512) % 512));
    }
    return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}

async function installFromArchive(directory, assetValue, archive, assetName='demo') {
    const manager = new PackageManager('TestVS64Pack', 'https://example.com/packages/', directory);
    manager._downloader.downloadToString = async () => JSON.stringify({
        version: '1.0.0', generic: { [assetName]: assetValue }
    });
    manager._downloader.download = async (url, target) => {
        const filename = typeof assetValue === 'string' ? `${assetName}.zip` : (assetValue.file || `${assetName}.zip`);
        const expectedUrl = assetValue.url || `https://example.com/packages/generic/${filename}`;
        if (url !== expectedUrl) {
            throw new Error(`unexpected archive URL: ${url}`);
        }
        if (path.basename(target) !== filename) {
            throw new Error(`unexpected archive filename: ${target}`);
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, archive);
    };
    await manager.connect();
    await manager.install(['generic']);
    return manager;
}

//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

describe('packman', () => {
    let directory;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'packman-test-'));
    });

    afterEach(() => {
        fs.rmSync(directory, { recursive: true, force: true });
    });

    test("packman_basics", async () => {
        const appName = "TestVS64Pack";
        const userAppDir = PackageManager.getUserAppDir(appName);
        expect(userAppDir).not.toBe(null);
    });

    test('skips consecutive sole directories in a ZIP asset', async () => {
        const manager = await installFromArchive(directory, '1.0.0', ZIP_FIXTURE);

        expect(fs.readFileSync(path.join(directory, 'demo/tool'), 'utf8')).toBe('zip tool');
        expect(manager.getAssetInstallInfo(manager._remoteManifest.getGroupAssets(['generic'])[0]).archiveName).toBe('demo.zip');
    });

    test('skips the sole bin directory when root is absent', async () => {
        await installFromArchive(directory, '1.0.0', UNWRAPPED_ZIP_FIXTURE);

        expect(fs.readFileSync(path.join(directory, 'demo/tool'), 'utf8')).toBe('zip tool');
        expect(fs.existsSync(path.join(directory, 'bin'))).toBe(false);
    });

    test('keeps archive directories when root is explicitly empty', async () => {
        await installFromArchive(directory, { version: '1.0.0', root: '' }, UNWRAPPED_ZIP_FIXTURE);

        expect(fs.readFileSync(path.join(directory, 'demo/bin/tool'), 'utf8')).toBe('zip tool');
        expect(JSON.parse(fs.readFileSync(path.join(directory, 'packages.json'), 'utf8')).generic.demo).toEqual({
            version: '1.0.0', root: ''
        });
    });

    test('skips an arbitrary sole root directory while preserving its contents', async () => {
        const archive = makeTar([
            { name: 'release/bin/tool', data: 'tool' },
            { name: 'release/docs/readme', data: 'readme' }
        ]);

        await installFromArchive(directory, { version: '1.0.0', file: 'demo.tar' }, archive);

        expect(fs.readFileSync(path.join(directory, 'demo/bin/tool'), 'utf8')).toBe('tool');
        expect(fs.readFileSync(path.join(directory, 'demo/docs/readme'), 'utf8')).toBe('readme');
    });

    test('keeps a root directory when the archive also has a root file', async () => {
        const archive = makeTar([
            { name: 'release/bin/tool', data: 'tool' },
            { name: 'license.txt', data: 'license' }
        ]);

        await installFromArchive(directory, { version: '1.0.0', file: 'demo.tar' }, archive);

        expect(fs.readFileSync(path.join(directory, 'demo/release/bin/tool'), 'utf8')).toBe('tool');
        expect(fs.readFileSync(path.join(directory, 'demo/license.txt'), 'utf8')).toBe('license');
    });

    test('removes a versioned archive folder matching the asset name', async () => {
        const archive = makeTar([
            { name: 'DEMO-3.10-win64/', type: '5' },
            { name: 'DEMO-3.10-win64/bin/', type: '5' },
            { name: 'DEMO-3.10-win64/bin/tool', data: 'versioned tool' }
        ]);

        await installFromArchive(directory, { version: '1.0.0', file: 'demo.tar' }, archive);

        expect(fs.readFileSync(path.join(directory, 'demo/tool'), 'utf8')).toBe('versioned tool');
        expect(fs.existsSync(path.join(directory, 'demo/DEMO-3.10-win64'))).toBe(false);
    });

    test('removes consecutive Acme archive wrappers', async () => {
        await installFromArchive(directory, { version: '1.0.0', file: 'acme.zip' }, ACME_ZIP_FIXTURE, 'acme');

        expect(fs.readFileSync(path.join(directory, 'acme/tool'), 'utf8')).toBe('acme tool');
        expect(fs.existsSync(path.join(directory, 'acme/acme0.97win'))).toBe(false);
    });

    test('removes a VICE wrapper with a digit inside the asset name', async () => {
        const archive = makeTar([{ name: 'SDL2VICE-3.10-win64/x64sc.exe', data: 'vice' }]);

        await installFromArchive(directory, { version: '1.0.0', file: 'sdlvice.tar' }, archive, 'sdlvice');

        expect(fs.readFileSync(path.join(directory, 'sdlvice/x64sc.exe'), 'utf8')).toBe('vice');
    });

    test('removes a versioned wrapper separated by an underscore', async () => {
        const archive = makeTar([{ name: 'denise_win64_v2.9/denise.exe', data: 'denise' }]);

        await installFromArchive(directory, { version: '1.0.0', file: 'denise.tar' }, archive, 'denise');

        expect(fs.readFileSync(path.join(directory, 'denise/denise.exe'), 'utf8')).toBe('denise');
    });

    test('keeps a top-level file whose name matches the asset', async () => {
        const archive = makeTar([{ name: 'demo', data: 'standalone tool' }]);

        await installFromArchive(directory, { version: '1.0.0', file: 'demo.tar' }, archive);

        expect(fs.readFileSync(path.join(directory, 'demo/demo'), 'utf8')).toBe('standalone tool');
    });

    test('installs a tar.gz asset named by the manifest', async () => {
        const archive = zlib.gzipSync(makeTar([
            { name: 'demo/', type: '5' },
            { name: 'demo/bin/', type: '5' },
            { name: 'demo/bin/tool', data: 'tar tool' },
            { name: 'demo/empty.txt' }
        ]));

        await installFromArchive(directory, { version: '1.0.0', file: 'demo.tar.gz' }, archive);

        expect(fs.readFileSync(path.join(directory, 'demo/bin/tool'), 'utf8')).toBe('tar tool');
        expect(fs.readFileSync(path.join(directory, 'demo/empty.txt'))).toHaveLength(0);
        expect(JSON.parse(fs.readFileSync(path.join(directory, 'packages.json'), 'utf8')).generic.demo).toEqual({
            version: '1.0.0', file: 'demo.tar.gz'
        });
    });

    unixTest.each(['demo.tar.gz', 'demo.tgz'])('preserves file and directory modes from %s', async filename => {
        const archive = zlib.gzipSync(makeTar([
            { name: 'release/', type: '5', mode: 0o755 },
            { name: 'release/bin/', type: '5', mode: 0o750 },
            { name: 'release/bin/tool', data: 'tool', mode: 0o755 },
            { name: 'release/bin/data', data: 'data', mode: 0o640 }
        ]));

        await installFromArchive(directory, { version: '1.0.0', file: filename, root: 'release' }, archive);

        expect(fs.statSync(path.join(directory, 'demo/bin')).mode & 0o7777).toBe(0o750);
        expect(fs.statSync(path.join(directory, 'demo/bin/tool')).mode & 0o7777).toBe(0o755);
        expect(fs.statSync(path.join(directory, 'demo/bin/data')).mode & 0o7777).toBe(0o640);
    });

    unixTest('preserves file and directory modes from tar.xz', async () => {
        await installFromArchive(directory, { version: '1.0.0', file: 'demo.tar.xz', root: 'release' }, TAR_XZ_MODE_FIXTURE);

        expect(fs.statSync(path.join(directory, 'demo/bin')).mode & 0o7777).toBe(0o750);
        expect(fs.statSync(path.join(directory, 'demo/bin/tool')).mode & 0o7777).toBe(0o755);
        expect(fs.statSync(path.join(directory, 'demo/bin/data')).mode & 0o7777).toBe(0o640);
    });

    test('downloads an item from its own URL while retaining its archive name', async () => {
        const value = {
            version: '1.0.0', file: 'release.tar.gz',
            url: 'https://downloads.example.net/releases/build-42'
        };
        const archive = zlib.gzipSync(makeTar([
            { name: 'tool', data: 'external tool' }
        ]));

        await installFromArchive(directory, value, archive);

        expect(fs.readFileSync(path.join(directory, 'demo/tool'), 'utf8')).toBe('external tool');
        expect(JSON.parse(fs.readFileSync(path.join(directory, 'packages.json'), 'utf8')).generic.demo).toEqual(value);
    });

    test('uses the default archive name for an item with only a URL', async () => {
        const value = { version: '1.0.0', url: 'https://downloads.example.net/tool' };

        await installFromArchive(directory, value, ZIP_FIXTURE);

        expect(fs.readFileSync(path.join(directory, 'demo/tool'), 'utf8')).toBe('zip tool');
    });

    test('installs a URL archive without a wrapper folder when root is absent', async () => {
        const value = { version: '1.0.0', file: 'release.tar', url: 'https://downloads.example.net/release' };
        const archive = makeTar([{ name: 'tool', data: 'root level tool' }]);

        await installFromArchive(directory, value, archive);

        expect(fs.readFileSync(path.join(directory, 'demo/tool'), 'utf8')).toBe('root level tool');
    });

    test('installs only the selected archive root under the asset name', async () => {
        const archive = makeTar([
            { name: 'release/', type: '5' },
            { name: 'release/bin/', type: '5' },
            { name: 'release/bin/tool', data: 'selected tool' },
            { name: 'other.txt', data: 'unrelated' }
        ]);
        const value = { version: '1.0.0', file: 'release.tar', root: 'release' };

        await installFromArchive(directory, value, archive);

        expect(fs.readFileSync(path.join(directory, 'demo/bin/tool'), 'utf8')).toBe('selected tool');
        expect(fs.existsSync(path.join(directory, 'demo/other.txt'))).toBe(false);
        expect(JSON.parse(fs.readFileSync(path.join(directory, 'packages.json'), 'utf8')).generic.demo).toEqual(value);
    });

    test('strips a nested archive root before installing its contents', async () => {
        const archive = makeTar([
            { name: 'aaa/', type: '5' },
            { name: 'aaa/bbb/', type: '5' },
            { name: 'aaa/bbb/ccc/', type: '5' },
            { name: 'aaa/bbb/ccc/tool', data: 'nested tool' },
            { name: 'aaa/other.txt', data: 'unrelated' }
        ]);

        await installFromArchive(directory, { version: '1.0.0', file: 'demo.tar', root: 'aaa/bbb' }, archive);

        expect(fs.readFileSync(path.join(directory, 'demo/ccc/tool'), 'utf8')).toBe('nested tool');
        expect(fs.existsSync(path.join(directory, 'demo/aaa'))).toBe(false);
    });

    test('rejects an archive root outside the extraction directory', async () => {
        const archive = makeTar([{ name: 'demo/tool', data: 'tool' }]);

        await expect(installFromArchive(directory,
            { version: '1.0.0', file: 'demo.tar', root: '../demo' }, archive))
            .rejects.toThrow();
        expect(fs.existsSync(path.join(directory, 'demo/tool'))).toBe(false);
    });

    test('rejects archive paths that escape the extraction directory', async () => {
        const archive = makeTar([{ name: '../outside.txt', data: 'escape' }]);

        await expect(installFromArchive(directory, { version: '1.0.0', file: 'demo.tar' }, archive))
            .rejects.toThrow("extracting 'demo' failed.");
        expect(fs.existsSync(path.join(directory, 'outside.txt'))).toBe(false);
    });

    test('rejects hard links in an archive', async () => {
        const archive = makeTar([{ name: 'demo/tool', type: '1', linkName: '../outside.txt' }]);

        await expect(installFromArchive(directory, { version: '1.0.0', file: 'demo.tar' }, archive))
            .rejects.toThrow("extracting 'demo' failed.");
    });

    symlinkTest('installs a relative symbolic link inside the asset directory', async () => {
        const archive = makeTar([
            { name: 'demo/bin/tool', data: 'linked tool' },
            { name: 'demo/bin/tool-alias', type: '2', linkName: 'tool' }
        ]);

        await installFromArchive(directory, { version: '1.0.0', file: 'demo.tar', root: '' }, archive);

        expect(fs.readFileSync(path.join(directory, 'demo/demo/bin/tool-alias'), 'utf8')).toBe('linked tool');
        expect(fs.lstatSync(path.join(directory, 'demo/demo/bin/tool-alias')).isSymbolicLink()).toBe(true);
    });

    test('rejects a symbolic link outside the asset directory', async () => {
        const archive = makeTar([{ name: 'demo/bin/tool-alias', type: '2', linkName: '../../../outside.txt' }]);

        await expect(installFromArchive(directory, { version: '1.0.0', file: 'demo.tar', root: '' }, archive))
            .rejects.toThrow("extracting 'demo' failed.");
        expect(fs.existsSync(path.join(directory, 'outside.txt'))).toBe(false);
    });

    symlinkTest('rejects a file entry that overwrites a symbolic link', async () => {
        const archive = makeTar([
            { name: 'demo/tool', data: 'original' },
            { name: 'demo/alias', type: '2', linkName: 'tool' },
            { name: 'demo/alias', data: 'replacement' }
        ]);

        await expect(installFromArchive(directory, { version: '1.0.0', file: 'demo.tar' }, archive))
            .rejects.toThrow("extracting 'demo' failed.");
    });

    symlinkTest('rejects archive entries beneath a symbolic link', async () => {
        const archive = makeTar([
            { name: 'demo/bin/', type: '5' },
            { name: 'demo/bin-alias', type: '2', linkName: 'bin' },
            { name: 'demo/bin-alias/tool', data: 'unexpected' }
        ]);

        await expect(installFromArchive(directory, { version: '1.0.0', file: 'demo.tar' }, archive))
            .rejects.toThrow("extracting 'demo' failed.");
        expect(fs.existsSync(path.join(directory, 'demo/bin/tool'))).toBe(false);
    });

    test.skip("packman_connect", async () => {
        const appName = "TestVS64Pack";
        const baseUrl = "http://192.168.2.2/vs64pack";
        const packageManager = new PackageManager(appName, baseUrl);

        await packageManager.connect();

        const assets = packageManager._remoteManifest.getGroupAssets(["win"]);
        expect(assets).not.toBe(null);

        //console.log("assets:" + assets);

        packageManager.uninstallAll();
        await packageManager.install();

    });

});  // describe
