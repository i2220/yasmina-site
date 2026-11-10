// Tiny stand-in for Cloudflare D1 built on node:sqlite, so the Functions can be tested without Cloudflare.
// Statements are compiled when they run (like D1), not when prepare() is called.
import { DatabaseSync } from 'node:sqlite';

export function fakeD1(file = ':memory:') {
  const sqlite = new DatabaseSync(file);
  const bound = (sql, args) => ({
    run: async () => {
      const info = sqlite.prepare(sql).run(...args);
      return { success: true, meta: { last_row_id: Number(info.lastInsertRowid), changes: info.changes } };
    },
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
  });
  return {
    prepare(sql) {
      return { ...bound(sql, []), bind: (...a) => bound(sql, a) };
    },
    batch: async (stmts) => {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
  };
}
