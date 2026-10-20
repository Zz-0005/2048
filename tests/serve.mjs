import { createServer } from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

/* Zero-dependency static server used by the E2E suite and local preview.
   It binds loopback by default; pass host: '0.0.0.0' (or HOST=0.0.0.0) to
   let a phone on the same network open the game. */
export async function startServer({ root = PROJECT_ROOT, port = 0, host = '127.0.0.1' } = {}) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/' || pathname === '') pathname = '/index.html';
      const filePath = path.resolve(root, '.' + pathname);
      if (filePath !== root && !filePath.startsWith(root + path.sep)) {
        res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('forbidden');
        return;
      }
      const stat = await fs.stat(filePath).catch(() => null);
      if (!stat || !stat.isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      createReadStream(filePath).pipe(res);
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end('server error');
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const address = server.address();
  const shown = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  return {
    url: `http://${shown}:${address.port}`,
    port: address.port,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url } = await startServer({
    root: process.env.ROOT ? path.resolve(process.env.ROOT) : PROJECT_ROOT,
    port: Number(process.env.PORT || 0),
    host: process.env.HOST || '127.0.0.1',
  });
  console.log('2048 preview at ' + url);
  if (process.env.HOST && process.env.HOST !== '127.0.0.1') {
    const { networkInterfaces } = await import('node:os');
    for (const list of Object.values(networkInterfaces())) {
      for (const entry of list || []) {
        if (entry.family === 'IPv4' && !entry.internal) {
          console.log('on your phone: http://' + entry.address + ':' + new URL(url).port);
        }
      }
    }
  }
}
