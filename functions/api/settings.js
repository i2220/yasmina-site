import { fail, getDb, getSettings, json } from '../../src/lib.js';

// GET /api/settings : the parts of the settings the public page needs (never the Zoom link).
export async function onRequestGet({ env }) {
  const db = getDb(env);
  if (!db) return fail('no database', 500);
  try {
    const s = await getSettings(db);
    return json({ ok: true, whatsapp: s.whatsapp, days: s.days, times: s.times, announcement: s.announcement }, 200, {
      'cache-control': 'public, max-age=30',
    });
  } catch {
    return fail('error', 500);
  }
}
