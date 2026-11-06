const Downloader = require('../downloader');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('downloader', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
    });

    test('allows an archive transfer to exceed the timeout while data keeps arriving', async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'packman-download-'));
        const target = path.join(directory, 'tool.zip');
        global.fetch = async (_url, { signal }) => {
            const body = new ReadableStream({
                start(controller) {
                    signal.addEventListener('abort', () =>
                        controller.error(new DOMException('This operation was aborted', 'AbortError')));
                    let i = 0;
                    const sendChunk = () => {
                        setTimeout(() => {
                            i++;
                            if (!signal.aborted) controller.enqueue(new Uint8Array([i]));
                            if (i === 4 && !signal.aborted) controller.close();
                            else if (!signal.aborted) sendChunk();
                        }, 25);
                    };
                    sendChunk();
                }
            });
            return new Response(body, { headers: { 'content-length': '4' } });
        };

        try {
            await expect(new Downloader(undefined, 50).download('https://example.com/tool.zip', target))
                .resolves.toBe(target);
            expect(fs.readFileSync(target)).toEqual(Buffer.from([1, 2, 3, 4]));
        } finally {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });

    test('reports a stalled response body as a timeout', async () => {
        global.fetch = async (_url, { signal }) => {
            const body = new ReadableStream({
                start(controller) {
                    controller.enqueue(new Uint8Array([1]));
                    signal.addEventListener('abort', () =>
                        controller.error(new DOMException('This operation was aborted', 'AbortError')));
                }
            });
            return new Response(body);
        };

        await expect(new Downloader(undefined, 25).downloadToString('https://example.com/packages.json'))
            .rejects.toThrow(/timed out.*25ms/);
    });

    test('retries a transient gateway error when fetching the manifest', async () => {
        let requests = 0;
        global.fetch = async () => {
            requests++;
            return new Response(requests === 1 ? 'Gateway Timeout' : '{"version":"1.0.0"}', {
                status: requests === 1 ? 504 : 200
            });
        };

        const manifest = await new Downloader().downloadToString('https://example.com/packages.json');

        expect(manifest).toBe('{"version":"1.0.0"}');
        expect(requests).toBe(2);
    });

    test('reports the status and URL when a gateway error persists', async () => {
        let requests = 0;
        global.fetch = async () => {
            requests++;
            return new Response('Gateway Timeout', { status: 504 });
        };

        await expect(new Downloader().downloadToString('https://example.com/packages.json'))
            .rejects.toThrow(/504.*https:\/\/example\.com\/packages\.json/);
        expect(requests).toBe(3);
    });
});
