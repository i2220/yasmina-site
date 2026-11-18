import { NO_DB, ensureSchema, fail, getDb, getSettings, json, readJson, validateBooking } from '../../src/lib.js';

// POST /api/book : saves a booking request from the public page.
export async function onRequestPost({ request, env }) {
  const db = getDb(env);
  if (!db) return NO_DB();

  const body = await readJson(request);
  if (!body || typeof body !== 'object') return fail('طلب غير صالح.');
  // hidden field that only bots fill in: pretend it worked
  if (body.website) return json({ ok: true });

  try {
    const settings = await getSettings(db);
    const { value, error } = validateBooking(body, settings);
    if (error) return fail(error);

    // stop the same phone from flooding the list
    const recent = await db
      .prepare("SELECT COUNT(*) AS c FROM bookings WHERE phone = ? AND created_at > datetime('now', '-1 hour')")
      .bind(value.phone)
      .first();
    if (recent && recent.c >= 3) return fail('وصلنا عدة طلبات من هذا الرقم. سنتواصل معك قريبًا.', 429);

    const res = await db
      .prepare(
        'INSERT INTO bookings (child, grade, parent, phone, kind, days, times, notes, age, level, goals, school, plan, trial, email, start_date, siblings, tz, source, lessons_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        value.child, value.grade, value.parent, value.phone, value.kind, JSON.stringify(value.days), JSON.stringify(value.times), value.notes,
        value.age, value.level, JSON.stringify(value.goals), value.school, value.plan, value.trial, value.email, value.start_date, value.siblings, value.tz, value.source,
        (settings.plans.find((p) => p.name === value.plan) || {}).lessons || 0,
      )
      .run();
    return json({ ok: true, id: res?.meta?.last_row_id ?? null }, 201);
  } catch (e) {
    return fail('تعذّر حفظ الطلب الآن. حاول مرة أخرى.', 500);
  }
}
