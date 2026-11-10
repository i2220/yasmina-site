// Shared helpers for the Pages Functions: database, settings, validation and admin sign-in.

export const GRADES = ['الأول الابتدائي', 'الثاني الابتدائي', 'الثالث الابتدائي', 'الرابع الابتدائي', 'الخامس الابتدائي', 'السادس الابتدائي'];
export const KINDS = ['حصة فردية', 'مجموعة صغيرة', 'أحتاج إلى نصيحة'];
export const ALL_DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
export const STATUSES = ['new', 'confirmed', 'done', 'cancelled'];

export const DEFAULTS = {
  whatsapp: '',
  countryCode: '965',
  zoomLink: '',
  announcement: '',
  days: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'],
  times: ['3:00 م', '4:00 م', '5:00 م', '6:00 م', '7:00 م'],
  confirmTemplate:
    'السلام عليكم {parent}، تم تأكيد حصة {child} ({grade}).\nالموعد: {day} الساعة {time} بتوقيت الكويت.\nرابط زووم: {zoom}\nنتمنى لطفلك حصة ممتعة.',
};

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function fail(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

/* ---------- database ---------- */

let schemaReady = null;

export function getDb(env) {
  if (!env || !env.DB) return null;
  return env.DB;
}

export const NO_DB = () => fail('قاعدة البيانات غير مربوطة بعد. اربط قاعدة D1 باسم DB في إعدادات المشروع على Cloudflare.', 500);

export function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db
      .batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS bookings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          child TEXT NOT NULL,
          grade TEXT NOT NULL,
          parent TEXT NOT NULL,
          phone TEXT NOT NULL,
          kind TEXT NOT NULL,
          days TEXT NOT NULL,
          times TEXT NOT NULL,
          notes TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'new',
          admin_note TEXT NOT NULL DEFAULT ''
        )`),
        db.prepare('CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status, id)'),
        db.prepare('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)'),
      ])
      .catch((e) => {
        schemaReady = null;
        throw e;
      });
  }
  return schemaReady;
}

export async function getSettings(db) {
  await ensureSchema(db);
  const { results } = await db.prepare('SELECT key, value FROM settings').all();
  const out = { ...DEFAULTS };
  for (const row of results || []) {
    if (!(row.key in DEFAULTS)) continue;
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      /* keep default */
    }
  }
  return out;
}

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const cleanList = (arr, max, count) =>
  (Array.isArray(arr) ? arr : []).map((x) => clean(x, max)).filter(Boolean).slice(0, count);

export function sanitizeSettings(input) {
  const s = {};
  if ('whatsapp' in input) s.whatsapp = String(input.whatsapp ?? '').replace(/\D/g, '').slice(0, 15);
  if ('countryCode' in input) s.countryCode = String(input.countryCode ?? '').replace(/\D/g, '').slice(0, 4);
  if ('zoomLink' in input) {
    const z = clean(input.zoomLink, 300);
    if (z && !/^https:\/\//i.test(z)) throw new Error('رابط زووم يجب أن يبدأ بـ https://');
    s.zoomLink = z;
  }
  if ('announcement' in input) s.announcement = clean(input.announcement, 140);
  if ('days' in input) {
    const d = cleanList(input.days, 12, 7).filter((x) => ALL_DAYS.includes(x));
    if (!d.length) throw new Error('اختر يومًا واحدًا على الأقل.');
    s.days = d;
  }
  if ('times' in input) {
    const t = cleanList(input.times, 14, 16);
    if (!t.length) throw new Error('أضف وقتًا واحدًا على الأقل.');
    s.times = t;
  }
  if ('confirmTemplate' in input) s.confirmTemplate = clean(input.confirmTemplate, 600);
  return s;
}

export async function saveSettings(db, patch) {
  await ensureSchema(db);
  const stmts = Object.entries(patch).map(([k, v]) =>
    db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .bind(k, JSON.stringify(v)),
  );
  if (stmts.length) await db.batch(stmts);
}

export function validateBooking(b, settings) {
  const child = clean(b.child, 60);
  const parent = clean(b.parent, 60);
  const notes = clean(b.notes, 500);
  const phone = clean(b.phone, 20);
  const digits = phone.replace(/\D/g, '');
  if (!child) return { error: 'اكتب اسم الطفل.' };
  if (!GRADES.includes(b.grade)) return { error: 'اختر الصف الدراسي.' };
  if (!parent) return { error: 'اكتب اسم ولي الأمر.' };
  if (digits.length < 8 || digits.length > 15) return { error: 'اكتب رقم واتساب صحيحًا، 8 أرقام على الأقل.' };
  if (!KINDS.includes(b.kind)) return { error: 'اختر نوع الحصة.' };
  const days = cleanList(b.days, 12, 7).filter((d) => ALL_DAYS.includes(d));
  if (!days.length) return { error: 'اختر يومًا واحدًا على الأقل.' };
  const times = cleanList(b.times, 14, 16).filter((t) => settings.times.includes(t));
  if (!times.length) return { error: 'اختر وقتًا واحدًا على الأقل.' };
  return { value: { child, grade: b.grade, parent, phone, kind: b.kind, days, times, notes } };
}

/* ---------- admin sign-in (signed cookie, no extra storage) ---------- */

const enc = new TextEncoder();
const COOKIE = 'ys_admin';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const secretOf = (env) => env.SESSION_SECRET || env.ADMIN_PASSWORD || '';

export async function passwordMatches(env, input) {
  if (!env.ADMIN_PASSWORD) return false;
  const a = await hmac('yasmina-cmp', String(input ?? ''));
  const b = await hmac('yasmina-cmp', env.ADMIN_PASSWORD);
  return sameBytes(a, b);
}

export async function sessionCookie(env, request) {
  const exp = String(Date.now() + SESSION_MS);
  const sig = b64u(await hmac(secretOf(env), exp));
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${exp}.${sig}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${secure}`;
}

export function clearCookie(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

export async function isAdmin(request, env) {
  const secret = secretOf(env);
  if (!secret) return false;
  const token = readCookie(request, COOKIE);
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const exp = token.slice(0, dot);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expected = b64u(await hmac(secret, exp));
  return sameBytes(enc.encode(expected), enc.encode(token.slice(dot + 1)));
}

// Returns a Response when the request must stop here, or null when the caller may continue.
export async function guardAdmin(request, env, { write = false } = {}) {
  if (!(await isAdmin(request, env))) return fail('سجّل الدخول أولًا.', 401);
  if (write) {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return fail('طلب غير مسموح.', 403);
  }
  return null;
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
