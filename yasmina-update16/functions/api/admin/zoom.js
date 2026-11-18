import { NO_DB, ensureSchema, fail, getDb, getSettings, guardAdmin, json, readJson } from '../../../src/lib.js';
import { ZoomError, createMeeting, deleteMeeting, zoomConfigured } from '../../../src/zoom.js';

// POST /api/admin/zoom { id, date: "2026-11-12", time: "16:00", duration? }
// Creates a Zoom meeting for the booking, saves the link on it and marks the booking as confirmed.
export async function onRequestPost({ request, env }) {
  const stop = await guardAdmin(request, env, { write: true });
  if (stop) return stop;
  const db = getDb(env);
  if (!db) return NO_DB();
  if (!zoomConfigured(env)) return fail('زووم غير مربوط بعد. أضف ZOOM_ACCOUNT_ID وZOOM_CLIENT_ID وZOOM_CLIENT_SECRET في إعدادات Cloudflare.', 400);
  await ensureSchema(db);

  const b = await readJson(request);
  const id = Number(b && b.id);
  if (!Number.isInteger(id) || id < 1) return fail('رقم الحجز غير صالح.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '') || !/^\d{2}:\d{2}$/.test(b.time || '')) return fail('اختر التاريخ والساعة.');
  const startsAt = new Date(`${b.date}T${b.time}:00+03:00`); // Kuwait has no daylight saving
  if (Number.isNaN(startsAt.getTime())) return fail('التاريخ أو الساعة غير صالحين.');
  if (startsAt.getTime() < Date.now() - 5 * 60_000) return fail('اختر موعدًا في المستقبل.');

  const booking = await db.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first();
  if (!booking) return fail('الحجز غير موجود.', 404);

  const settings = await getSettings(db);
  const duration = Number.isFinite(Number(b.duration)) && Number(b.duration) >= 10 && Number(b.duration) <= 240 ? Math.round(Number(b.duration)) : settings.zoomDuration;

  let meeting;
  try {
    meeting = await createMeeting(env, {
      host: settings.zoomHostEmail,
      topic: `حصة إنجليزية - ${booking.child}`,
      start: `${b.date}T${b.time}:00`,
      duration,
    });
  } catch (e) {
    return fail(e instanceof ZoomError ? e.message : 'تعذّر إنشاء الاجتماع.', 502);
  }

  if (booking.zoom_meeting_id) await deleteMeeting(env, booking.zoom_meeting_id);
  const zoomStart = `${b.date} ${b.time}`;
  await db
    .prepare("UPDATE bookings SET zoom_link = ?, zoom_meeting_id = ?, zoom_start = ?, status = 'confirmed' WHERE id = ?")
    .bind(meeting.joinUrl, meeting.id, zoomStart, id)
    .run();
  return json({ ok: true, zoom_link: meeting.joinUrl, zoom_start: zoomStart });
}
