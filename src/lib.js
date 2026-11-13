// Shared helpers for the Pages Functions: database, settings, validation and admin sign-in.

export const GRADES = ['الأول الابتدائي', 'الثاني الابتدائي', 'الثالث الابتدائي', 'الرابع الابتدائي', 'الخامس الابتدائي', 'السادس الابتدائي'];
export const KINDS = ['حصة فردية', 'مجموعة صغيرة', 'أحتاج إلى نصيحة'];
export const ALL_DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
export const STATUSES = ['new', 'confirmed', 'done', 'cancelled'];
export const LEVELS = ['لا يعرف الإنجليزية بعد', 'يعرف الحروف والكلمات البسيطة', 'يقرأ كلمات وجملًا قصيرة', 'يقرأ ويتحدث بشكل متوسط', 'لا أعرف، أريد تقييمًا'];
export const GOALS = ['تأسيس الحروف والأصوات', 'القراءة', 'المفردات', 'النطق والمحادثة', 'الكتابة والإملاء', 'مراجعة المنهج المدرسي', 'التحضير للاختبارات', 'حب اللغة والثقة'];
export const SCHOOLS = ['حكومي', 'لغات', 'دولي', 'تعليم منزلي'];
export const SOURCES = ['واتساب', 'انستغرام', 'تيك توك', 'صديق أو قريب', 'بحث جوجل', 'أخرى'];
export const TZS = ['الكويت', 'السعودية', 'الإمارات', 'قطر', 'البحرين', 'عُمان', 'مصر', 'أخرى'];
export const PAY = ['unpaid', 'partial', 'paid'];

export const DEFAULTS = {
  whatsapp: '',
  countryCode: '965',
  zoomLink: '',
  zoomHostEmail: '',
  zoomDuration: 40,
  announcement: '',
  days: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'],
  times: ['3:00 م', '4:00 م', '5:00 م', '6:00 م', '7:00 م'],
  currency: 'د.ك',
  teacherName: 'يسمينا طارق العربي',
  teacherTitle: 'معلمة لغة إنجليزية للمرحلة الابتدائية',
  teacherYears: 10,
  teacherCity: 'الإسكندرية',
  teacherArea: 'البيطاش',
  mapQuery: 'البيطاش، الإسكندرية، مصر',
  teacherBio:
    'معلمة لغة إنجليزية بخبرة تزيد على 10 سنوات في تدريس الأطفال، تعمل في الإسكندرية (منطقة البيطاش). تقدّم حصصًا مباشرة عبر زووم لطلاب المرحلة الابتدائية بأسلوب ممتع ومنظّم، وتتابع كل طفل على حدة.',
  teacherStats: [
    { n: '+10', l: 'سنوات خبرة في تدريس الإنجليزية' },
    { n: '6', l: 'صفوف ابتدائية، من الأول إلى السادس' },
    { n: '40', l: 'دقيقة لكل حصة مباشرة' },
    { n: '1:1', l: 'حصة فردية أو مجموعة صغيرة' },
  ],
  plans: [
    { name: 'حصة تجريبية', lessons: 1, price: 0 },
    { name: 'باقة 4 حصص', lessons: 4, price: 0 },
    { name: 'باقة 8 حصص', lessons: 8, price: 0 },
    { name: 'باقة 12 حصة', lessons: 12, price: 0 },
  ],
  reminderTemplate: 'السلام عليكم {parent}، تذكير بحصة {child} {day} الساعة {time} بتوقيت الكويت.\nرابط زووم: {zoom}\nنراكم قريبًا.',
  followTemplate: 'السلام عليكم {parent}، وصلنا طلب حجز حصة إنجليزية لـ {child} ({grade}). هل ما زلتم مهتمين؟ يسعدنا تحديد موعد مناسب لكم.',
  cancelTemplate: 'السلام عليكم {parent}، تم إلغاء حصة {child} المقررة {day} الساعة {time}. يسعدنا إعادة الجدولة في الوقت الذي يناسبكم.',
  thanksTemplate: 'شكرًا لكم {parent} على حضور {child} اليوم. نتمنى أن تكون الحصة ممتعة، وسنرسل لكم ملاحظات التقدّم قريبًا.',
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

export function _resetSchema() {
  schemaReady = null;
}

// Columns added after the first release. Adding one that already exists fails harmlessly.
async function migrate(db) {
  const cols = [
    ['zoom_link', "TEXT NOT NULL DEFAULT ''"],
    ['zoom_meeting_id', "TEXT NOT NULL DEFAULT ''"],
    ['zoom_start', "TEXT NOT NULL DEFAULT ''"],
    ['age', "TEXT NOT NULL DEFAULT ''"],
    ['level', "TEXT NOT NULL DEFAULT ''"],
    ['goals', "TEXT NOT NULL DEFAULT '[]'"],
    ['school', "TEXT NOT NULL DEFAULT ''"],
    ['plan', "TEXT NOT NULL DEFAULT ''"],
    ['trial', 'INTEGER NOT NULL DEFAULT 0'],
    ['email', "TEXT NOT NULL DEFAULT ''"],
    ['start_date', "TEXT NOT NULL DEFAULT ''"],
    ['siblings', 'INTEGER NOT NULL DEFAULT 1'],
    ['tz', "TEXT NOT NULL DEFAULT ''"],
    ['source', "TEXT NOT NULL DEFAULT ''"],
    ['pay_status', "TEXT NOT NULL DEFAULT 'unpaid'"],
    ['amount', 'REAL NOT NULL DEFAULT 0'],
    ['lessons_total', 'INTEGER NOT NULL DEFAULT 0'],
    ['lessons_done', 'INTEGER NOT NULL DEFAULT 0'],
    ['next_follow', "TEXT NOT NULL DEFAULT ''"],
  ];
  // Look at what the table already has and add only the missing columns (no reliance on error wording).
  const info = await db.prepare('PRAGMA table_info(bookings)').all();
  const have = new Set((info.results || []).map((r) => r.name));
  for (const [name, def] of cols) {
    if (have.has(name)) continue;
    try {
      await db.prepare(`ALTER TABLE bookings ADD COLUMN ${name} ${def}`).run();
    } catch (e) {
      if (!/duplicate column|already exists/i.test(String(e && (e.message || e.cause))) ) throw e;
    }
  }
}

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
      .then(() => migrate(db))
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
  if ('zoomHostEmail' in input) {
    const e = clean(input.zoomHostEmail, 120);
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('اكتب بريد حساب زووم بشكل صحيح.');
    s.zoomHostEmail = e;
  }
  if ('zoomDuration' in input) {
    const d = Math.round(Number(input.zoomDuration));
    if (!Number.isFinite(d) || d < 10 || d > 240) throw new Error('مدة الحصة بين 10 و240 دقيقة.');
    s.zoomDuration = d;
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
  for (const k of ['reminderTemplate', 'followTemplate', 'cancelTemplate', 'thanksTemplate']) if (k in input) s[k] = clean(input[k], 600);
  if ('currency' in input) s.currency = clean(input.currency, 8);
  if ('teacherName' in input) s.teacherName = clean(input.teacherName, 60);
  if ('teacherTitle' in input) s.teacherTitle = clean(input.teacherTitle, 80);
  if ('teacherCity' in input) s.teacherCity = clean(input.teacherCity, 40);
  if ('teacherArea' in input) s.teacherArea = clean(input.teacherArea, 40);
  if ('mapQuery' in input) s.mapQuery = clean(input.mapQuery, 120);
  if ('teacherBio' in input) s.teacherBio = clean(input.teacherBio, 700);
  if ('teacherYears' in input) {
    const y = Math.round(Number(input.teacherYears));
    if (!Number.isFinite(y) || y < 0 || y > 60) throw new Error('سنوات الخبرة بين 0 و60.');
    s.teacherYears = y;
  }
  if ('teacherStats' in input) {
    const arr = (Array.isArray(input.teacherStats) ? input.teacherStats : [])
      .map((x) => ({ n: clean(x && x.n, 10), l: clean(x && x.l, 60) }))
      .filter((x) => x.n && x.l)
      .slice(0, 8);
    s.teacherStats = arr;
  }
  if ('plans' in input) {
    const arr = (Array.isArray(input.plans) ? input.plans : [])
      .map((x) => ({ name: clean(x && x.name, 40), lessons: Math.max(0, Math.min(200, Math.round(Number(x && x.lessons) || 0))), price: Math.max(0, Math.min(100000, Number(x && x.price) || 0)) }))
      .filter((x) => x.name)
      .slice(0, 8);
    if (!arr.length) throw new Error('أضف باقة واحدة على الأقل.');
    s.plans = arr;
  }
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
  const age = String(b.age ?? '').trim();
  if (age && !/^(?:[5-9]|1[0-3])$/.test(age)) return { error: 'عمر الطفل بين 5 و13 سنة.' };
  const level = b.level ? String(b.level) : '';
  if (level && !LEVELS.includes(level)) return { error: 'مستوى غير صالح.' };
  const goals = cleanList(b.goals, 40, 8).filter((g) => GOALS.includes(g));
  const school = b.school ? String(b.school) : '';
  if (school && !SCHOOLS.includes(school)) return { error: 'نوع المدرسة غير صالح.' };
  const plan = b.plan ? clean(b.plan, 40) : '';
  if (plan && !settings.plans.some((p) => p.name === plan)) return { error: 'الباقة غير موجودة.' };
  const email = clean(b.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'البريد الإلكتروني غير صحيح.' };
  const start = b.start_date ? String(b.start_date) : '';
  if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) return { error: 'تاريخ البدء غير صالح.' };
  const tz = b.tz ? String(b.tz) : '';
  if (tz && !TZS.includes(tz)) return { error: 'الدولة غير صالحة.' };
  const source = b.source ? String(b.source) : '';
  if (source && !SOURCES.includes(source)) return { error: 'المصدر غير صالح.' };
  const sib = Math.round(Number(b.siblings) || 1);
  const siblings = sib >= 1 && sib <= 6 ? sib : 1;
  const trial = b.trial ? 1 : 0;
  return { value: { child, grade: b.grade, parent, phone, kind: b.kind, days, times, notes, age, level, goals, school, plan, trial, email, start_date: start, siblings, tz, source } };
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
