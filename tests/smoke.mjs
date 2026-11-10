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

console.log(`\n${n} checks passed`);
