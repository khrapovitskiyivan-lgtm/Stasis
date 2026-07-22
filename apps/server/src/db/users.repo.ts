import type { Db } from './connection.js';

export interface UserRow {
  id: number;
  tgUserId: number;
  username: string | null;
  lang: string | null;
  createdAt: number;
  deletedAt: number | null;
}

export function usersRepo(db: Db) {
  const insert = db.prepare(
    `INSERT INTO users (tg_user_id, username, lang, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(tg_user_id) DO UPDATE SET username = excluded.username, lang = excluded.lang`
  );
  const select = db.prepare(`SELECT * FROM users WHERE tg_user_id = ?`);
  const map = (r: any): UserRow | undefined =>
    r && { id: r.id, tgUserId: r.tg_user_id, username: r.username, lang: r.lang, createdAt: r.created_at, deletedAt: r.deleted_at };

  return {
    upsertByTgId(tgUserId: number, username?: string, lang?: string) {
      insert.run(tgUserId, username ?? null, lang ?? null, Date.now());
      const row = map(select.get(tgUserId))!;
      return { id: row.id, tgUserId: row.tgUserId };
    },
    getByTgId(tgUserId: number): UserRow | undefined {
      return map(select.get(tgUserId));
    },
  };
}
