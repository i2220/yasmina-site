import { fail, json, passwordMatches, readJson, sessionCookie } from '../../../src/lib.js';

// POST /api/admin/login { password }
export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD) return fail('لم تُضبط كلمة المرور ADMIN_PASSWORD في إعدادات المشروع.', 500);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return fail('طلب غير مسموح.', 403);

  const body = await readJson(request);
  if (!(await passwordMatches(env, body && body.password))) {
    await new Promise((r) => setTimeout(r, 700)); // slows down guessing
    return fail('كلمة المرور غير صحيحة.', 401);
  }
  return json({ ok: true }, 200, { 'set-cookie': await sessionCookie(env, request) });
}
