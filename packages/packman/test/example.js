const fs = require('fs');
const http = require('http');
const path = require('path');
const { PackageManager, PackageManagerOptions } = require('../packages/packman');

module.exports = { PackageManager, PackageManagerOptions };

function serveDirectory(directory) {
  const server = http.createServer(async (request, response) => {
    const filePath = getDataFilePath(directory, request.url);

    if (!filePath) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    try {
      const stat = await fs.promises.stat(filePath);
      response.writeHead(200, {
        'content-length': stat.size,
        'content-type': getContentType(filePath),
      });

      fs.createReadStream(filePath)
        .on('error', () => {
          response.destroy();
        })
        .pipe(response);
    } catch (error) {
      if (!response.headersSent) {
        response.writeHead(500);
        response.end('Unable to read file');
      } else {
        response.destroy(error);
      }
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

function getContentType(filePath) {
  if (filePath.endsWith('.json')) {
    return 'application/json; charset=utf-8';
  }

  if (filePath.endsWith('.zip')) {
    return 'application/zip';
  }

  return 'application/octet-stream';
}

function getDataFilePath(directory, requestUrl) {
  const { pathname } = new URL(requestUrl, 'http://127.0.0.1');
  const filename = path.basename(pathname);

  if (!filename || filename.includes('..')) {
    return null;
  }

  return path.join(directory, filename);
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function createProgressLogger() {
  const lastReportedPercentByAsset = new Map();
  let activeAsset = null;

  return (progress) => {
    if (!shouldLogProgress(progress, lastReportedPercentByAsset)) {
      return;
    }

    const line = formatProgressLine(progress);

    if (!process.stdout.isTTY) {
      console.log(line);
      return;
    }

    if (activeAsset && activeAsset !== progress.asset) {
      process.stdout.write('\n');
    }

    activeAsset = progress.asset;
    process.stdout.write(`\r${line}`);

    if (progress.percent === 100) {
      process.stdout.write('\n');
      activeAsset = null;
    }
  };
}

function shouldLogProgress(progress, lastReportedPercentByAsset) {
  if (progress.percent === null) {
    return true;
  }

  const lastReportedPercent = lastReportedPercentByAsset.get(progress.asset) ?? -5;
  const shouldLog = progress.percent === 100 || progress.percent - lastReportedPercent >= 5;

  if (shouldLog) {
    lastReportedPercentByAsset.set(progress.asset, progress.percent);
  }

  return shouldLog;
}

function formatProgressLine(progress) {
  const total = progress.totalBytes === null ? '?' : formatBytes(progress.totalBytes);
  const percentText = progress.percent === null ? '  ?  ' : `${progress.percent.toFixed(1).padStart(5)}%`;
  const bar = formatProgressBar(progress.percent);

  return `${progress.asset.padEnd(20)} ${bar} ${percentText} ${formatBytes(progress.receivedBytes)} / ${total}`;
}

function formatProgressBar(percent) {
  const width = 30;

  if (percent === null) {
    return `[${'?'.repeat(width)}]`;
  }

  const filled = Math.min(width, Math.max(0, Math.round((percent / 100) * width)));
  return `[${'#'.repeat(filled)}${'.'.repeat(width - filled)}]`;
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

async function main() {
  const dataDir = path.join(process.cwd(), 'data');
  const installDir = path.join(process.cwd(), 'installdir');
  const server = await serveDirectory(dataDir);
  const packageManager = new PackageManager(new PackageManagerOptions(
    process.cwd(),
    createProgressLogger()
  ));

  try {
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;
    const groups = ['common', PackageManager.getPlatformId()];

    const result = await packageManager.reinstall(groups, baseUrl, installDir);

    console.log('Installed packages:');
    console.log(result);
  } finally {
    await closeServer(server);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
