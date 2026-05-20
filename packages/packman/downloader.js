const fs = require('fs');
const path = require('path');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { URL } = require('url');

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_REDIRECTS = 5;

class Downloader {
    constructor(onProgress = undefined, timeoutMs = undefined, maxRedirects = undefined) {
        timeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
        maxRedirects = maxRedirects ?? DEFAULT_MAX_REDIRECTS;

        this.validateConstructorArguments(onProgress, timeoutMs, maxRedirects);

        this.timeoutMs = timeoutMs;
        this.maxRedirects = maxRedirects;
        this.onProgress = onProgress;
    }

    set callback(onProgress) {
        this.onProgress = onProgress;
    }

    async download(url, targetPath) {
        await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });

        const { response, cleanup } = await this.getResponse(url);
        const tempPath = this.getTempOutputPath(targetPath);
        const totalBytes = this.getContentLength(response);

        try {
            await pipeline(
                this.getResponseStream(response),
                this.createProgressStream(totalBytes),
                fs.createWriteStream(tempPath)
            );
            await fs.promises.rename(tempPath, targetPath);
            return targetPath;
        } catch (error) {
            await this.removePartialFile(tempPath);
            throw error;
        } finally {
            cleanup();
        }
    }

    async downloadToString(url, encoding = 'utf8') {
        if (typeof encoding !== 'string') {
            throw new TypeError('encoding must be a string');
        }

        const { response, cleanup } = await this.getResponse(url);

        try {
            const buffer = Buffer.from(await response.arrayBuffer());
            return buffer.toString(encoding);
        } finally {
            cleanup();
        }
    }

    async getResponse(url, redirectsRemaining = this.maxRedirects) {
        const parsedUrl = new URL(url);
        this.validateProtocol(parsedUrl);

        const result = await this.fetchWithTimeout(parsedUrl);
        const { response, cleanup } = result;

        if (this.isRedirect(response.status)) {
            await this.discardResponse(response);
            cleanup();

            const location = response.headers.get('location');

            if (!location) {
                throw new Error(`Redirect response ${response.status} is missing a location header`);
            }

            if (redirectsRemaining <= 0) {
                throw new Error('Too many redirects');
            }

            const redirectUrl = new URL(location, parsedUrl);
            return this.getResponse(redirectUrl.toString(), redirectsRemaining - 1);
        }

        if (!response.ok) {
            await this.discardResponse(response);
            cleanup();
            throw new Error(`Download failed with status ${response.status}`);
        }

        return result;
    }

    createProgressStream(totalBytes) {
        let receivedBytes = 0;

        return new Transform({
            transform: (chunk, encoding, callback) => {
                receivedBytes += chunk.length;

                try {
                    const cancellationStatus = this.emitProgress({
                        receivedBytes,
                        totalBytes,
                        chunkBytes: chunk.length,
                    });
                    if (cancellationStatus === true) {
                        callback(new Error("cancelled"));
                        return;
                    }
                } catch (error) {
                    callback(error);
                    return;
                }

                callback(null, chunk);
            },
        });
    }

    getResponseStream(response) {
        if (!response.body) {
            throw new Error('Response body is empty');
        }

        return Readable.fromWeb(response.body);
    }

    getTempOutputPath(targetPath) {
        const directory = path.dirname(targetPath);
        const filename = path.basename(targetPath);
        const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

        return path.join(directory, `.${filename}.${suffix}.tmp`);
    }

    validateProtocol(parsedUrl) {
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            throw new Error(`Unsupported protocol: ${parsedUrl.protocol}`);
        }
    }

    isRedirect(statusCode) {
        return [301, 302, 303, 307, 308].includes(statusCode);
    }

    getContentLength(response) {
        const contentLength = Number.parseInt(response.headers.get('content-length'), 10);
        return Number.isSafeInteger(contentLength) && contentLength >= 0 ? contentLength : null;
    }

    emitProgress(progress) {
        if (!this.onProgress) {
            return;
        }

        const percent = progress.totalBytes === null
            ? null
            : (progress.receivedBytes / progress.totalBytes) * 100;

        const cancellationStatus = this.onProgress({
            ...progress,
            percent,
        });

        return cancellationStatus;
    }

    async removePartialFile(filePath) {
        await fs.promises.rm(filePath, { force: true });
    }

    async fetchWithTimeout(url) {
        if (typeof fetch !== 'function') {
            throw new Error('Native fetch is not available. Use Node.js 18 or newer.');
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => {
            controller.abort();
        }, this.timeoutMs);

        try {
            const response = await fetch(url, {
                redirect: 'manual',
                signal: controller.signal,
            });

            return {
                response,
                cleanup: () => clearTimeout(timeout),
            };
        } catch (error) {
            clearTimeout(timeout);

            if (error.name === 'AbortError') {
                throw new Error(`Download timed out after ${this.timeoutMs}ms`);
            }

            throw error;
        }
    }

    async discardResponse(response) {
        if (!response.body) {
            return;
        }

        try {
            await response.body.cancel();
        } catch (_error) {
            // Ignore body cleanup errors while preparing the actual request error.
        }
    }

    validateConstructorArguments(onProgress, timeoutMs, maxRedirects) {
        if (onProgress !== undefined && typeof onProgress !== 'function') {
            throw new TypeError('onProgress must be a function');
        }

        if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
            throw new TypeError('timeoutMs must be a non-negative number');
        }

        if (!Number.isInteger(maxRedirects) || maxRedirects < 0) {
            throw new TypeError('maxRedirects must be a non-negative integer');
        }
    }
}

module.exports = Downloader;
