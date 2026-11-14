// Run with: node tests/smoke.mjs   (Node 22+)
import assert from 'node:assert/strict';
import { fakeD1 } from './d1-adapter.mjs';
import * as book from '../functions/api/book.js';
import * as publicSettings from '../functions/api/settings.js';
import * as login from '../functions/api/admin/login.js';
import * as me from '../functions/api/admin/me.js';
import * as bookings from '../functions/api/admin/bookings.js';
import * as adminSettings from '../functions/api/admin/settings.js';
import worker from '../src/worker.js';
import * as docsRoute from '../functions/api/admin/docs.js';
import * as zoomRoute from '../functions/api/admin/zoom.js';
import { resetZoomCache } from '../src/zoom.js';
import { _resetSchema } from '../src/lib.js';

const env = { DB: fakeD1(), ADMIN_PASSWORD: 'correct horse', SESSION_SECRET: 'test-secret' };
const origin = 'https://yasmina.example';
const req = (path, method = 'GET', body, headers = {}) =>
  new Request(origin + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
const call = async (fn, r) => {
  const res = await fn({ request: r, env });
  return { res, data: await res.json() };
};

const good = { child: 'سارة', grade: 'الثالث الابتدائي', parent: 'منى', phone: '55512345', kind: 'حصة فردية', days: ['الأحد'], times: ['4:00 م'], notes: '' };
let n = 0;
const t = async (name, fn) => {
  await fn();
  n++;
  console.log('ok -', name);
};

await t('booking is saved', async () => {
  const { res, data } = await call(book.onRequestPost, req('/api/book', 'POST', good));
  assert.equal(res.status, 201);
  assert.equal(data.ok, true);
});
await t('bad booking is rejected with a message', async () => {
  for (const bad of [{ ...good, child: '' }, { ...good, grade: 'x' }, { ...good, phone: '12' }, { ...good, days: [] }, { ...good, times: ['9:99 ص'] }]) {
    const { res, data } = await call(book.onRequestPost, req('/api/book', 'POST', bad));
    assert.equal(res.status, 400);
    assert.ok(data.error);
  }
});
await t('honeypot is silently accepted but not stored', async () => {
  const { data } = await call(book.onRequestPost, req('/api/book', 'POST', { ...good, child: 'روبوت', website: 'spam.example' }));
  assert.equal(data.ok, true);
});
await t('same phone is limited to 3 per hour', async () => {
  await call(book.onRequestPost, req('/api/book', 'POST', good));
  await call(book.onRequestPost, req('/api/book', 'POST', good));
  const { res } = await call(book.onRequestPost, req('/api/book', 'POST', good));
  assert.equal(res.status, 429);
});
await t('public settings never include the Zoom link', async () => {
  const { data } = await call(publicSettings.onRequestGet, req('/api/settings'));
  assert.equal(data.ok, true);
  assert.ok(!('zoomLink' in data));
  assert.ok(data.times.includes('4:00 م'));
});
await t('admin routes refuse anonymous visitors', async () => {
  assert.equal((await call(me.onRequestGet, req('/api/admin/me'))).res.status, 401);
  assert.equal((await call(bookings.onRequestGet, req('/api/admin/bookings'))).res.status, 401);
  assert.equal((await call(adminSettings.onRequestGet, req('/api/admin/settings'))).res.status, 401);
  assert.equal((await call(bookings.onRequestDelete, req('/api/admin/bookings?id=1', 'DELETE'))).res.status, 401);
});
await t('wrong password fails, right password sets a cookie', async () => {
  const wrong = await call(login.onRequestPost, req('/api/admin/login', 'POST', { password: 'nope' }));
  assert.equal(wrong.res.status, 401);
  assert.equal(wrong.res.headers.get('set-cookie'), null);
});
const ok = await call(login.onRequestPost, req('/api/admin/login', 'POST', { password: 'correct horse' }));
assert.equal(ok.res.status, 200);
const cookie = ok.res.headers.get('set-cookie');
assert.match(cookie, /HttpOnly/);
assert.match(cookie, /SameSite=Strict/);
assert.match(cookie, /Secure/);
const auth = { cookie: cookie.split(';')[0] };
n++;
console.log('ok - login sets an HttpOnly Secure SameSite=Strict cookie');

await t('signed-in admin can list bookings and sees counts', async () => {
  assert.equal((await call(me.onRequestGet, req('/api/admin/me', 'GET', null, auth))).res.status, 200);
  const { data } = await call(bookings.onRequestGet, req('/api/admin/bookings', 'GET', null, auth));
  assert.equal(data.bookings.length, 3);
  assert.deepEqual(data.bookings[0].days, ['الأحد']);
  assert.equal(data.counts.new, 3);
});
await t('a forged or expired cookie is refused', async () => {
  assert.equal((await call(me.onRequestGet, req('/api/admin/me', 'GET', null, { cookie: 'ys_admin=99999999999999.AAAA' }))).res.status, 401);
  const exp = Date.now() - 1000;
  assert.equal((await call(me.onRequestGet, req('/api/admin/me', 'GET', null, { cookie: `ys_admin=${exp}.AAAA` }))).res.status, 401);
});
await t('status update, note, search and filter work', async () => {
  const list = (await call(bookings.onRequestGet, req('/api/admin/bookings', 'GET', null, auth))).data.bookings;
  const id = list[0].id;
  const up = await call(bookings.onRequestPatch, req('/api/admin/bookings', 'PATCH', { id, status: 'confirmed', admin_note: 'تم الاتصال' }, auth));
  assert.equal(up.data.ok, true);
  const f = (await call(bookings.onRequestGet, req('/api/admin/bookings?status=confirmed', 'GET', null, auth))).data;
  assert.equal(f.bookings.length, 1);
  assert.equal(f.bookings[0].admin_note, 'تم الاتصال');
  assert.equal(f.counts.confirmed, 1);
  const s = (await call(bookings.onRequestGet, req('/api/admin/bookings?q=' + encodeURIComponent('سار'), 'GET', null, auth))).data;
  assert.equal(s.bookings.length, 3);
  assert.equal((await call(bookings.onRequestPatch, req('/api/admin/bookings', 'PATCH', { id, status: 'hacked' }, auth))).res.status, 400);
});
await t('cross-site writes are refused', async () => {
  const { res } = await call(bookings.onRequestPatch, req('/api/admin/bookings', 'PATCH', { id: 1, status: 'done' }, { ...auth, origin: 'https://evil.example' }));
  assert.equal(res.status, 403);
});
await t('delete removes a booking', async () => {
  const list = (await call(bookings.onRequestGet, req('/api/admin/bookings', 'GET', null, auth))).data.bookings;
  const del = await call(bookings.onRequestDelete, req('/api/admin/bookings?id=' + list[0].id, 'DELETE', null, auth));
  assert.equal(del.data.ok, true);
  assert.equal((await call(bookings.onRequestGet, req('/api/admin/bookings', 'GET', null, auth))).data.bookings.length, 2);
});
await t('settings can be saved and the public page sees the allowed parts', async () => {
  const put = await call(
    adminSettings.onRequestPut,
    req('/api/admin/settings', 'PUT', { whatsapp: '+965 5000 0000', zoomLink: 'https://zoom.us/j/123', announcement: 'خصم', days: ['السبت', 'الأحد'], times: ['2:00 م', '8:00 م'] }, auth),
  );
  assert.equal(put.data.settings.whatsapp, '96550000000');
  const pub = (await call(publicSettings.onRequestGet, req('/api/settings'))).data;
  assert.deepEqual(pub.days, ['السبت', 'الأحد']);
  assert.equal(pub.announcement, 'خصم');
  assert.ok(!('zoomLink' in pub));
  const adm = (await call(adminSettings.onRequestGet, req('/api/admin/settings', 'GET', null, auth))).data;
  assert.equal(adm.settings.zoomLink, 'https://zoom.us/j/123');
});
await t('settings reject bad input', async () => {
  assert.equal((await call(adminSettings.onRequestPut, req('/api/admin/settings', 'PUT', { zoomLink: 'javascript:alert(1)' }, auth))).res.status, 400);
  assert.equal((await call(adminSettings.onRequestPut, req('/api/admin/settings', 'PUT', { days: [] }, auth))).res.status, 400);
});
await t('times removed from settings are no longer accepted for bookings', async () => {
  const { res } = await call(book.onRequestPost, req('/api/book', 'POST', { ...good, phone: '66611122', times: ['4:00 م'] }));
  assert.equal(res.status, 400);
});
await t('missing database gives a clear Arabic error', async () => {
  const res = await book.onRequestPost({ request: req('/api/book', 'POST', good), env: {} });
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /D1/);
});

/* ---------- Zoom (Zoom itself is replaced by a stand-in) ---------- */
const zenv = { ...env, ZOOM_ACCOUNT_ID: 'acc', ZOOM_CLIENT_ID: 'cid', ZOOM_CLIENT_SECRET: 'sec' };
const zcall = async (body, headers = auth, e = zenv) => {
  const res = await zoomRoute.onRequestPost({ request: req('/api/admin/zoom', 'POST', body, headers), env: e });
  return { res, data: await res.json() };
};
const futureDate = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
const realFetch = globalThis.fetch;
let seen = [];
let zoomMode = 'ok';
globalThis.fetch = async (u, init = {}) => {
  const url = String(u);
  seen.push({ url, init });
  if (url.startsWith('https://zoom.us/oauth/token')) return Response.json({ access_token: 'tok', expires_in: 3600 });
  if (init.method === 'POST' && url.includes('/meetings')) {
    if (zoomMode === 'error') return Response.json({ code: 124, message: 'Invalid access token.' }, { status: 401 });
    return Response.json({ id: 555 + seen.length, join_url: 'https://zoom.us/j/555?pwd=z' }, { status: 201 });
  }
  return new Response(null, { status: 204 });
};
resetZoomCache();
const firstId = async () => (await call(bookings.onRequestGet, req('/api/admin/bookings', 'GET', null, auth))).data.bookings[0].id;

await t('zoom is refused when it is not connected, or when signed out', async () => {
  const id = await firstId();
  const a = await zcall({ id, date: futureDate, time: '16:00' }, auth, env);
  assert.equal(a.res.status, 400);
  assert.match(a.data.error, /زووم غير مربوط/);
  assert.equal((await zcall({ id, date: futureDate, time: '16:00' }, {})).res.status, 401);
});
await t('zoom meeting is created in Kuwait time, saved on the booking, and the booking is confirmed', async () => {
  const id = await firstId();
  seen = [];
  const { res, data } = await zcall({ id, date: futureDate, time: '16:00' });
  assert.equal(res.status, 200);
  assert.equal(data.zoom_link, 'https://zoom.us/j/555?pwd=z');
  const tokenCall = seen.find((s) => s.url.startsWith('https://zoom.us/oauth/token'));
  assert.match(tokenCall.url, /account_id=acc/);
  assert.equal(tokenCall.init.headers.authorization, 'Basic ' + btoa('cid:sec'));
  const meet = seen.find((s) => s.url.includes('/meetings'));
  assert.match(meet.url, /\/v2\/users\/me\/meetings$/);
  const body = JSON.parse(meet.init.body);
  assert.equal(body.timezone, 'Asia/Kuwait');
  assert.equal(body.start_time, `${futureDate}T16:00:00`);
  assert.equal(body.duration, 40);
  assert.equal(body.type, 2);
  const row = (await call(bookings.onRequestGet, req('/api/admin/bookings', 'GET', null, auth))).data.bookings.find((b) => b.id === id);
  assert.equal(row.zoom_link, data.zoom_link);
  assert.equal(row.zoom_start, `${futureDate} 16:00`);
  assert.equal(row.status, 'confirmed');
});
await t('creating again replaces the meeting and deletes the old one', async () => {
  const id = await firstId();
  seen = [];
  const { res } = await zcall({ id, date: futureDate, time: '17:30', duration: 60 });
  assert.equal(res.status, 200);
  const del = seen.find((s) => s.init.method === 'DELETE');
  assert.ok(del && /\/v2\/meetings\/\d+$/.test(del.url));
  assert.equal(JSON.parse(seen.find((s) => s.init.method === 'POST' && s.url.includes('/meetings')).init.body).duration, 60);
});
await t('the host email from the settings is used', async () => {
  await call(adminSettings.onRequestPut, req('/api/admin/settings', 'PUT', { zoomHostEmail: 'teacher@example.com', zoomDuration: 45 }, auth));
  seen = [];
  await zcall({ id: await firstId(), date: futureDate, time: '15:00' });
  const meet = seen.find((s) => s.url.includes('/meetings') && s.init.method === 'POST');
  assert.match(meet.url, /users\/teacher%40example\.com\/meetings/);
  assert.equal(JSON.parse(meet.init.body).duration, 45);
});
await t('zoom input is validated', async () => {
  const id = await firstId();
  assert.equal((await zcall({ id, date: '2020-01-01', time: '10:00' })).res.status, 400);
  assert.equal((await zcall({ id, date: 'nope', time: '10:00' })).res.status, 400);
  assert.equal((await zcall({ id: 99999, date: futureDate, time: '10:00' })).res.status, 404);
  assert.equal((await call(adminSettings.onRequestPut, req('/api/admin/settings', 'PUT', { zoomHostEmail: 'not-an-email' }, auth))).res.status, 400);
  assert.equal((await call(adminSettings.onRequestPut, req('/api/admin/settings', 'PUT', { zoomDuration: 5 }, auth))).res.status, 400);
});
await t('a Zoom error is shown to the admin and the booking is left alone', async () => {
  const id = await firstId();
  const before = (await call(bookings.onRequestGet, req('/api/admin/bookings', 'GET', null, auth))).data.bookings.find((b) => b.id === id).zoom_link;
  zoomMode = 'error';
  resetZoomCache();
  const { res, data } = await zcall({ id, date: futureDate, time: '12:00' });
  zoomMode = 'ok';
  assert.equal(res.status, 502);
  assert.match(data.error, /Invalid access token/);
  const after = (await call(bookings.onRequestGet, req('/api/admin/bookings', 'GET', null, auth))).data.bookings.find((b) => b.id === id).zoom_link;
  assert.equal(after, before);
});
await t('settings report whether Zoom is connected', async () => {
  const a = await adminSettings.onRequestGet({ request: req('/api/admin/settings', 'GET', null, auth), env });
  assert.equal((await a.json()).zoomConfigured, false);
  const b = await adminSettings.onRequestGet({ request: req('/api/admin/settings', 'GET', null, auth), env: zenv });
  assert.equal((await b.json()).zoomConfigured, true);
});
await t('a database made by the first release is upgraded without losing bookings', async () => {
  const old = fakeD1();
  await old.prepare(`CREATE TABLE bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL DEFAULT (datetime('now')), child TEXT NOT NULL, grade TEXT NOT NULL, parent TEXT NOT NULL, phone TEXT NOT NULL, kind TEXT NOT NULL, days TEXT NOT NULL, times TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'new', admin_note TEXT NOT NULL DEFAULT '')`).run();
  await old.prepare("INSERT INTO bookings (child, grade, parent, phone, kind, days, times) VALUES ('قديم','الأول الابتدائي','أب','55500000','حصة فردية','[\"الأحد\"]','[\"3:00 م\"]')").run();
  _resetSchema();
  const oenv = { ...zenv, DB: old };
  const list = await bookings.onRequestGet({ request: req('/api/admin/bookings', 'GET', null, auth), env: oenv });
  const rows = (await list.json()).bookings;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].child, 'قديم');
  assert.equal(rows[0].zoom_link, '');
  const z = await zcall({ id: rows[0].id, date: futureDate, time: '16:00' }, auth, oenv);
  assert.equal(z.res.status, 200);
  _resetSchema(); // run the upgrade again on an already upgraded database
  assert.equal((await bookings.onRequestGet({ request: req('/api/admin/bookings', 'GET', null, auth), env: oenv })).status, 200);
});
globalThis.fetch = realFetch;

await t('worker routes /api to handlers and everything else to static assets', async () => {
  const wenv = { ...env, ASSETS: { fetch: async () => new Response('<html>static</html>') } };
  const wf = (path, method = 'GET', body, headers = {}) => worker.fetch(req(path, method, body, headers), wenv);
  assert.equal((await wf('/api/settings')).status, 200);
  assert.equal((await wf('/api/admin/me')).status, 401);
  assert.equal((await wf('/api/nope')).status, 404);
  assert.equal((await wf('/api/book', 'GET')).status, 404);
  assert.equal(await (await wf('/admin/')).text(), '<html>static</html>');
  const l = await wf('/api/admin/login', 'POST', { password: 'correct horse' });
  assert.equal(l.status, 200);
  assert.equal((await wf('/api/admin/bookings', 'GET', null, { cookie: l.headers.get('set-cookie').split(';')[0] })).status, 200);
});

await t('richer booking fields are stored, validated and editable by the admin', async () => {
  const phone = '55598765';
  const cur = (await call(publicSettings.onRequestGet, req('/api/settings'))).data;
  Object.assign(good, { days: [cur.days[0]], times: [cur.times[0]] });
  const full = { ...good, phone, age: '8', level: 'يقرأ كلمات وجملًا قصيرة', goals: ['القراءة', 'النطق والمحادثة', 'غير موجود'], school: 'لغات', plan: 'حصة تجريبية', trial: true, email: 'mom@example.com', start_date: '2026-12-01', siblings: 2, tz: 'الكويت', source: 'انستغرام' };
  const ok = await call(book.onRequestPost, req('/api/book', 'POST', full));
  assert.equal(ok.res.status, 201, JSON.stringify(ok.data));
  for (const bad of [{ age: '2' }, { level: 'x' }, { school: 'x' }, { plan: 'لا توجد' }, { email: 'not-an-email' }, { start_date: 'tomorrow' }, { tz: 'x' }, { source: 'x' }]) {
    const { res } = await call(book.onRequestPost, req('/api/book', 'POST', { ...good, phone: '55511111', ...bad }));
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
  const l = await call(login.onRequestPost, req('/api/admin/login', 'POST', { password: 'correct horse' }));
  const auth = { cookie: l.res.headers.get('set-cookie').split(';')[0] };
  const list = await call(bookings.onRequestGet, req('/api/admin/bookings', 'GET', null, auth));
  const row = list.data.bookings.find((b) => b.phone === phone);
  assert.equal(row.age, '8');
  assert.deepEqual(row.goals, ['القراءة', 'النطق والمحادثة']);
  assert.equal(row.trial, 1);
  assert.equal(row.siblings, 2);
  assert.equal(row.lessons_total, 1);
  assert.equal(row.pay_status, 'unpaid');
  const patch = (body) => call(bookings.onRequestPatch, req('/api/admin/bookings', 'PATCH', { id: row.id, ...body }, auth));
  assert.equal((await patch({ pay_status: 'paid', amount: 12.5, lessons_total: 8, lessons_done: 3, next_follow: '2026-12-02' })).res.status, 200);
  assert.equal((await patch({ pay_status: 'weird' })).res.status, 400);
  assert.equal((await patch({ amount: -4 })).res.status, 400);
  assert.equal((await patch({ next_follow: 'soon' })).res.status, 400);
  const after = (await call(bookings.onRequestGet, req('/api/admin/bookings', 'GET', null, auth))).data.bookings.find((b) => b.id === row.id);
  assert.equal(after.pay_status, 'paid');
  assert.equal(after.amount, 12.5);
  assert.equal(after.lessons_done, 3);
  assert.equal(after.next_follow, '2026-12-02');
});
await t('teacher profile and plans are public, editable and sanitized', async () => {
  const pub = (await call(publicSettings.onRequestGet, req('/api/settings'))).data;
  assert.equal(pub.teacher.name, 'يسمينا طارق العربي');
  assert.equal(pub.teacher.area, 'البيطاش');
  assert.ok(pub.teacher.stats.length >= 3);
  assert.ok(pub.plans.length >= 2);
  assert.ok(pub.options.goals.length > 3);
  assert.ok(!('zoomLink' in pub));
  const l = await call(login.onRequestPost, req('/api/admin/login', 'POST', { password: 'correct horse' }));
  const auth = { cookie: l.res.headers.get('set-cookie').split(';')[0] };
  const put = (body) => call(adminSettings.onRequestPut, req('/api/admin/settings', 'PUT', body, auth));
  const r = await put({ teacherYears: 12, teacherStats: [{ n: '+300', l: 'طالب وطالبة' }, { n: '', l: 'فارغ' }], plans: [{ name: 'باقة 10', lessons: 10, price: 50 }], reminderTemplate: 'تذكير {child}' });
  assert.equal(r.res.status, 200);
  assert.equal(r.data.settings.teacherYears, 12);
  assert.equal(r.data.settings.teacherStats.length, 1);
  assert.equal(r.data.settings.plans[0].price, 50);
  assert.equal((await put({ plans: [] })).res.status, 400);
  assert.equal((await put({ teacherYears: 'abc' })).res.status, 400);
  await put({ plans: [{ name: 'حصة تجريبية', lessons: 1, price: 0 }, { name: 'باقة 4 حصص', lessons: 4, price: 0 }], teacherStats: [{ n: '+10', l: 'سنوات خبرة' }, { n: '6', l: 'صفوف' }, { n: '40', l: 'دقيقة' }] });
});

await t('reports and invoices are stored for the admin only', async () => {
  const anon = await call(docsRoute.onRequestGet, req('/api/admin/docs?kind=report'));
  assert.equal(anon.res.status, 401);
  const l = await call(login.onRequestPost, req('/api/admin/login', 'POST', { password: 'correct horse' }));
  const auth = { cookie: l.res.headers.get('set-cookie').split(';')[0] };
  const post = (b) => call(docsRoute.onRequestPost, req('/api/admin/docs', 'POST', b, auth));
  const a = await post({ kind: 'report', booking_id: 1, title: 'سارة', data: { skills: { speaking: 4 } } });
  assert.equal(a.res.status, 201);
  assert.equal((await post({ kind: 'bad', data: {} })).res.status, 400);
  assert.equal((await post({ kind: 'invoice', data: [] })).res.status, 400);
  const up = await post({ id: a.data.id, kind: 'report', booking_id: 1, title: 'سارة 2', data: { skills: { speaking: 5 } } });
  assert.equal(up.res.status, 200);
  const g = await call(docsRoute.onRequestGet, req('/api/admin/docs?kind=report&booking_id=1', 'GET', undefined, auth));
  assert.equal(g.data.docs.length, 1);
  assert.equal(g.data.docs[0].data.skills.speaking, 5);
  const inv = await post({ kind: 'invoice', title: 'YS-INV-0001', data: { total: 10 } });
  assert.equal((await call(docsRoute.onRequestGet, req('/api/admin/docs?kind=invoice', 'GET', undefined, auth))).data.docs.length, 1);
  await call(docsRoute.onRequestDelete, req('/api/admin/docs?id=' + inv.data.id, 'DELETE', undefined, auth));
  assert.equal((await call(docsRoute.onRequestGet, req('/api/admin/docs?kind=invoice', 'GET', undefined, auth))).data.docs.length, 0);
});
await t('whatsapp numbers get the country code when local', async () => {
  const { waNumber } = await import('../src/lib.js');
  assert.equal(waNumber('5551 2345', '965'), '96555512345');
  assert.equal(waNumber('+965 5551 2345', '965'), '96555512345');
  assert.equal(waNumber('', '965'), '');
});

console.log(`\n${n} checks passed`);
