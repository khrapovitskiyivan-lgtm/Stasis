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
     ON CONFLICT(tg_user_id) DO UPDATE SET
       username = COALESCE(excluded.username, users.username),
       lang = COALESCE(excluded.lang, users.lang)`
  );
  // Unfiltered fetch used only to read back a just-upserted (never-deleted) row.
  const selectAnyByTgId = db.prepare(`SELECT * FROM users WHERE tg_user_id = ?`);
  // Public reads exclude soft-deleted users.
  const selectByTgId = db.prepare(`SELECT * FROM users WHERE tg_user_id = ? AND deleted_at IS NULL`);
  const selectById = db.prepare(`SELECT * FROM users WHERE id = ? AND deleted_at IS NULL`);
  const map = (r: any): UserRow | undefined =>
    r && { id: r.id, tgUserId: r.tg_user_id, username: r.username, lang: r.lang, createdAt: r.created_at, deletedAt: r.deleted_at };

  return {
    upsertByTgId(tgUserId: number, username?: string, lang?: string) {
      insert.run(tgUserId, username ?? null, lang ?? null, Date.now());
      const row = map(selectAnyByTgId.get(tgUserId))!;
      return { id: row.id, tgUserId: row.tgUserId };
    },
    getByTgId(tgUserId: number): UserRow | undefined {
      return map(selectByTgId.get(tgUserId));
    },
    getById(id: number): UserRow | undefined {
      return map(selectById.get(id));
    },
  };
}
