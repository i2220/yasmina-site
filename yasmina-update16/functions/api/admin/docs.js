import { NO_DB, ensureSchema, fail, getDb, guardAdmin, json, readJson } from '../../../src/lib.js';

const KINDS = ['report', 'invoice'];
const MAX = 60000; // characters of JSON per document

const row = (r) => {
  let data = {};
  try {
    data = JSON.parse(r.data);
  } catch {}
  return { id: r.id, created_at: r.created_at, kind: r.kind, booking_id: r.booking_id, title: r.title, data };
};

// GET /api/admin/docs?kind=report&booking_id=3
export async function onRequestGet({ request, env }) {
  const stop = await guardAdmin(request, env);
  if (stop) return stop;
  const db = getDb(env);
  if (!db) return NO_DB();
  await ensureSchema(db);
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind') || '';
  if (!KINDS.includes(kind)) return fail('نوع المستند غير صحيح.');
  const bid = Number(url.searchParams.get('booking_id') || 0);
  const sql = `SELECT * FROM docs WHERE kind = ?${bid ? ' AND booking_id = ?' : ''} ORDER BY id DESC LIMIT 300`;
  const { results } = await db.prepare(sql).bind(...(bid ? [kind, bid] : [kind])).all();
  return json({ ok: true, docs: (results || []).map(row) });
}

// POST /api/admin/docs  { id?, kind, booking_id?, title, data }  (with id: replaces that document)
export async function onRequestPost({ request, env }) {
  const stop = await guardAdmin(request, env);
  if (stop) return stop;
  const db = getDb(env);
  if (!db) return NO_DB();
  await ensureSchema(db);
  const b = await readJson(request);
  if (!b || !KINDS.includes(b.kind)) return fail('نوع المستند غير صحيح.');
  if (!b.data || typeof b.data !== 'object' || Array.isArray(b.data)) return fail('بيانات المستند غير صحيحة.');
  const data = JSON.stringify(b.data);
  if (data.length > MAX) return fail('المستند كبير جدًا.');
  const title = String(b.title ?? '').trim().slice(0, 120);
  const booking = Math.max(0, Math.floor(Number(b.booking_id) || 0));
  const id = Math.floor(Number(b.id) || 0);
  if (id) {
    const r = await db.prepare('UPDATE docs SET title = ?, booking_id = ?, data = ? WHERE id = ? AND kind = ?').bind(title, booking, data, id, b.kind).run();
    if (!r.meta || !r.meta.changes) return fail('المستند غير موجود.', 404);
    return json({ ok: true, id });
  }
  const r = await db.prepare('INSERT INTO docs (kind, booking_id, title, data) VALUES (?, ?, ?, ?)').bind(b.kind, booking, title, data).run();
  return json({ ok: true, id: r?.meta?.last_row_id ?? null }, 201);
}

// DELETE /api/admin/docs?id=5
export async function onRequestDelete({ request, env }) {
  const stop = await guardAdmin(request, env);
  if (stop) return stop;
  const db = getDb(env);
  if (!db) return NO_DB();
  await ensureSchema(db);
  const id = Math.floor(Number(new URL(request.url).searchParams.get('id')) || 0);
  if (!id) return fail('رقم غير صحيح.');
  await db.prepare('DELETE FROM docs WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
