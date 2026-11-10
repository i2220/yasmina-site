import { NO_DB, STATUSES, ensureSchema, fail, getDb, guardAdmin, json, readJson } from '../../../src/lib.js';

const parseList = (s) => {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

// GET /api/admin/bookings?status=new&q=text
export async function onRequestGet({ request, env }) {
  const stop = await guardAdmin(request, env);
  if (stop) return stop;
  const db = getDb(env);
  if (!db) return NO_DB();
  await ensureSchema(db);

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || '';
  const q = (url.searchParams.get('q') || '').trim().slice(0, 60);

  const where = [];
  const args = [];
  if (STATUSES.includes(status)) {
    where.push('status = ?');
    args.push(status);
  }
  if (q) {
    where.push('(child LIKE ? OR parent LIKE ? OR phone LIKE ?)');
    const like = `%${q.replace(/[%_]/g, '')}%`;
    args.push(like, like, like);
  }
  const sql = `SELECT * FROM bookings ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 500`;
  const { results } = await db.prepare(sql).bind(...args).all();
  const counts = { new: 0, confirmed: 0, done: 0, cancelled: 0 };
  const grouped = await db.prepare('SELECT status, COUNT(*) AS c FROM bookings GROUP BY status').all();
  for (const r of grouped.results || []) if (r.status in counts) counts[r.status] = r.c;

  const bookings = (results || []).map((r) => ({ ...r, days: parseList(r.days), times: parseList(r.times) }));
  return json({ ok: true, bookings, counts });
}

// PATCH /api/admin/bookings { id, status?, admin_note? }
export async function onRequestPatch({ request, env }) {
  const stop = await guardAdmin(request, env, { write: true });
  if (stop) return stop;
  const db = getDb(env);
  if (!db) return NO_DB();
  await ensureSchema(db);

  const b = await readJson(request);
  const id = Number(b && b.id);
  if (!Number.isInteger(id) || id < 1) return fail('رقم الحجز غير صالح.');
  const sets = [];
  const args = [];
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) return fail('حالة غير صالحة.');
    sets.push('status = ?');
    args.push(b.status);
  }
  if (b.admin_note !== undefined) {
    sets.push('admin_note = ?');
    args.push(String(b.admin_note).slice(0, 500));
  }
  if (!sets.length) return fail('لا يوجد ما يُحدَّث.');
  await db.prepare(`UPDATE bookings SET ${sets.join(', ')} WHERE id = ?`).bind(...args, id).run();
  return json({ ok: true });
}

// DELETE /api/admin/bookings?id=5
export async function onRequestDelete({ request, env }) {
  const stop = await guardAdmin(request, env, { write: true });
  if (stop) return stop;
  const db = getDb(env);
  if (!db) return NO_DB();
  await ensureSchema(db);

  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id < 1) return fail('رقم الحجز غير صالح.');
  await db.prepare('DELETE FROM bookings WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
