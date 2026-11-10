import { clearCookie, json } from '../../../src/lib.js';

// POST /api/admin/logout
export async function onRequestPost({ request }) {
  return json({ ok: true }, 200, { 'set-cookie': clearCookie(request) });
}
