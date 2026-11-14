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
  'GET /api/admin/docs': ['functions/api/admin/docs.js', 'onRequestGet'],
  'POST /api/admin/docs': ['functions/api/admin/docs.js', 'onRequestPost'],
  'DELETE /api/admin/docs': ['functions/api/admin/docs.js', 'onRequestDelete'],
  'POST /api/admin/zoom': ['functions/api/admin/zoom.js', 'onRequestPost'],
};

// ZOOM_MOCK=1 pretends to be Zoom so the panel can be tried without real credentials
if (process.env.ZOOM_MOCK) {
  Object.assign(env, { ZOOM_ACCOUNT_ID: 'mock', ZOOM_CLIENT_ID: 'mock', ZOOM_CLIENT_SECRET: 'mock' });
  const real = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    const s = String(u);
    if (s.startsWith('https://zoom.us/oauth/token')) return Response.json({ access_token: 'mock', expires_in: 3600 });
    if (s.startsWith('https://api.zoom.us/v2/users/')) return Response.json({ id: 8123456789, join_url: 'https://zoom.us/j/8123456789?pwd=mock' }, { status: 201 });
    if (s.startsWith('https://api.zoom.us/')) return new Response(null, { status: 204 });
    return real(u, init);
  };
}
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
