import { clearStudentCookie, json } from '../../../src/lib.js';

// POST /api/student/logout
export async function onRequestPost({ request }) {
  return json({ ok: true }, 200, { 'set-cookie': clearStudentCookie(request) });
}
