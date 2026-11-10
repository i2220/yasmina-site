// Local preview without Cloudflare: node tests/dev-server.mjs   (Node 22+, data kept in memory)
// Open http://localhost:8788  ·  admin: http://localhost:8788/admin  ·  password: yasmina-dev
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeD1 } from './d1-adapter.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { DB: fakeD1(), ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'yasmina-dev', SESSION_SECRET: 'local-dev-secret' };
const port = Number(process.env.PORT) || 8788;

const routes = {
  'POST /api/book': ['functions/api/book.js', 'onRequestPost'],
  'GET /api/settings': ['functions/api/settings.js', 'onRequestGet'],
  'POST /api/admin/login': ['functions/api/admin/login.js', 'onRequestPost'],
  'POST /api/admin/logout': ['functions/api/admin/logout.js', 'onRequestPost'],
  'GET /api/admin/me': ['functions/api/admin/me.js', 'onRequestGet'],
  'GET /api/admin/bookings': ['functions/api/admin/bookings.js', 'onRequestGet'],
  'PATCH /api/admin/bookings': ['functions/api/admin/bookings.js', 'onRequestPatch'],
  'DELETE /api/admin/bookings': ['functions/api/admin/bookings.js', 'onRequestDelete'],
  'GET /api/admin/settings': ['functions/api/admin/settings.js', 'onRequestGet'],
  'PUT /api/admin/settings': ['functions/api/admin/settings.js', 'onRequestPut'],
};
const types = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.js': 'text/javascript', '.css': 'text/css' };

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const hit = routes[`${req.method} ${url.pathname}`];
    if (hit) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const mod = await import('../' + hit[0]);
      const r = await mod[hit[1]]({ request, env });
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    let p = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
    if (p === '/admin') p = '/admin/index.html';
    const file = path.join(root, 'public', path.normalize(p));
    if (!file.startsWith(path.join(root, 'public')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`http://localhost:${port}`));
