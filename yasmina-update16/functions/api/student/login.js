import { NO_DB, ensureAccounts, ensureSchema, fail, getDb, json, normUser, readJson, studentCookie } from '../../../src/lib.js';

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

// POST /api/student/login { username, password }
export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return fail('طلب غير مسموح.', 403);
  const db = getDb(env);
  if (!db) return NO_DB();
  await ensureSchema(db);
  await ensureAccounts(db);
  const b = await readJson(request);
  const user = normUser(b && b.username);
  const pass = String((b && b.password) ?? '').trim();
  if (!user || !pass) return fail('اكتب اسم المستخدم وكلمة المرور.');
  const row = await db.prepare("SELECT id, stu_pass, stu_fails, stu_lock FROM bookings WHERE stu_user = ? AND status IN ('confirmed','done')").bind(user).first();
  if (row && row.stu_lock > Date.now()) return fail('تم إيقاف الدخول مؤقتًا بعد محاولات خاطئة. حاول بعد 15 دقيقة أو تواصل مع المعلمة.', 429);
  if (!row || row.stu_pass !== pass) {
    if (row) {
      const fails = row.stu_fails + 1;
      await db.prepare('UPDATE bookings SET stu_fails = ?, stu_lock = ? WHERE id = ?').bind(fails >= MAX_FAILS ? 0 : fails, fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0, row.id).run();
    }
    await new Promise((r) => setTimeout(r, 500));
    return fail('اسم المستخدم أو كلمة المرور غير صحيحة.', 401);
  }
  await db.prepare('UPDATE bookings SET stu_fails = 0, stu_lock = 0 WHERE id = ?').bind(row.id).run();
  return json({ ok: true }, 200, { 'set-cookie': await studentCookie(env, request, row.id) });
}
