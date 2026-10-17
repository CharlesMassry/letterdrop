/**
 * Zero-dependency static file server for dist/.
 * Usage: node scripts/static-server.mjs
 * Visit: http://127.0.0.1:3847
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', 'dist');
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 3847);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.map': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

if (!fs.existsSync(path.join(root, 'index.html'))) {
  console.error(`Missing ${path.join(root, 'index.html')}`);
  console.error('Run `npm run build` first, or use `npm start` (build + play).');
  process.exit(1);
}

function safeJoin(base, reqPath) {
  const decoded = decodeURIComponent((reqPath || '/').split('?')[0] || '/');
  const cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(base, cleaned);
  if (!full.startsWith(base)) return null;
  return full;
}

const server = http.createServer((req, res) => {
  let filePath = safeJoin(root, req.url || '/');
  if (!filePath) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    // SPA-style fallback
    filePath = path.join(root, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = TYPES[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Server error');
      return;
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(data);
  });
});

server.listen(port, host, () => {
  console.log('');
  console.log('  Letterdrop (static build)');
  console.log(`  → http://127.0.0.1:${port}`);
  console.log(`  → http://localhost:${port}`);
  console.log('');
  console.log('  Keep this terminal open. Ctrl+C to stop.');
  console.log('');
});
