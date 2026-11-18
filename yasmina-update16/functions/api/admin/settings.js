import { NO_DB, ALL_DAYS, fail, getDb, getSettings, guardAdmin, json, readJson, sanitizeSettings, saveSettings } from '../../../src/lib.js';

import { zoomConfigured } from '../../../src/zoom.js';

// GET /api/admin/settings : every setting, including the Zoom link.
export async function onRequestGet({ request, env }) {
  const stop = await guardAdmin(request, env);
  if (stop) return stop;
  const db = getDb(env);
  if (!db) return NO_DB();
  return json({ ok: true, settings: await getSettings(db), allDays: ALL_DAYS, zoomConfigured: zoomConfigured(env) });
}

// PUT /api/admin/settings { ...fields }
export async function onRequestPut({ request, env }) {
  const stop = await guardAdmin(request, env, { write: true });
  if (stop) return stop;
  const db = getDb(env);
  if (!db) return NO_DB();

  const body = await readJson(request);
  if (!body || typeof body !== 'object') return fail('طلب غير صالح.');
  let patch;
  try {
    patch = sanitizeSettings(body);
  } catch (e) {
    return fail(e.message);
  }
  await saveSettings(db, patch);
  return json({ ok: true, settings: await getSettings(db) });
}
