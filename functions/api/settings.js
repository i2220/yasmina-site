import { GOALS, LEVELS, SCHOOLS, SOURCES, TZS, fail, getDb, getSettings, json, waNumber } from '../../src/lib.js';

// GET /api/settings : the parts of the settings the public page needs (never the Zoom link).
export async function onRequestGet({ env }) {
  const db = getDb(env);
  if (!db) return fail('no database', 500);
  try {
    const s = await getSettings(db);
    return json({
      ok: true, whatsapp: waNumber(s.whatsapp, s.countryCode), days: s.days, times: s.times, announcement: s.announcement,
      currency: s.currency, plans: s.plans,
      teacher: { name: s.teacherName, title: s.teacherTitle, years: s.teacherYears, city: s.teacherCity, area: s.teacherArea, bio: s.teacherBio, stats: s.teacherStats, mapQuery: s.mapQuery },
      options: { levels: LEVELS, goals: GOALS, schools: SCHOOLS, sources: SOURCES, tzs: TZS },
    }, 200, {
      'cache-control': 'public, max-age=30',
    });
  } catch {
    return fail('error', 500);
  }
}
