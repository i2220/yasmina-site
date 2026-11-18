import { NO_DB, ensureSchema, fail, getDb, getSettings, json, studentId, waNumber } from '../../../src/lib.js';

const parse = (s, d) => {
  try {
    return JSON.parse(s);
  } catch {
    return d;
  }
};

// GET /api/student/me : the signed-in student's own progress. Private teacher notes are never sent.
export async function onRequestGet({ request, env }) {
  const id = await studentId(request, env);
  if (!id) return fail('سجّل الدخول أولًا.', 401);
  const db = getDb(env);
  if (!db) return NO_DB();
  await ensureSchema(db);
  const b = await db.prepare("SELECT * FROM bookings WHERE id = ? AND status IN ('confirmed','done')").bind(id).first();
  if (!b) return fail('الحساب غير متاح.', 401);
  const { results } = await db.prepare("SELECT id, created_at, data FROM docs WHERE kind = 'report' AND booking_id = ? ORDER BY id ASC").bind(id).all();
  const reports = [];
  for (const r of results || []) {
    const data = parse(r.data, {});
    if (data.publish === false) continue;
    delete data.private;
    reports.push({ id: r.id, created_at: r.created_at, data });
  }
  const s = await getSettings(db);
  const total = Number(b.lessons_total) || 0;
  const done = Number(b.lessons_done) || 0;
  return json({
    ok: true,
    student: {
      id: b.id, code: 'YS-' + (1000 + b.id), child: b.child, grade: b.grade, plan: b.plan, status: b.status,
      lessons_total: total, lessons_done: done, lessons_left: Math.max(0, total - done),
      next: b.zoom_start && b.zoom_link ? { start: b.zoom_start, link: b.zoom_link } : null,
    },
    reports,
    teacher: { name: s.teacherName, city: s.teacherCity, area: s.teacherArea, photo: s.teacherPhoto, whatsapp: waNumber(s.whatsapp, s.countryCode) },
  }, 200, { 'cache-control': 'no-store' });
}
