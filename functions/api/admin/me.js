import { guardAdmin, json } from '../../../src/lib.js';

// GET /api/admin/me : tells the panel whether the visitor is signed in.
export async function onRequestGet({ request, env }) {
  const stop = await guardAdmin(request, env);
  if (stop) return stop;
  return json({ ok: true });
}
