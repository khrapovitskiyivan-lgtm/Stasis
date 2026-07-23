import type { Db } from './connection.js';

// Child tables owned by a user, ordered so FK constraints (PRAGMA foreign_keys=ON)
// never reject a delete: a referencing row must be deleted BEFORE the row it
// points at. shares.profile_id -> profiles(id) and profiles.test_run_id ->
// test_runs(id), so the order is shares -> profiles -> test_runs. Missing tables
// are skipped via an existence check.
const CHILD_TABLES = ['shares', 'profiles', 'test_runs', 'consents', 'signals', 'follow_ups'] as const;

function tableExists(db: Db, name: string): boolean {
  const row = db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name);
  return row !== undefined;
}

/** Hard-deletes all data owned by a Telegram user and soft-deletes the user row itself. No-op if unknown. */
export function deleteUserData(db: Db, tgUserId: number): void {
  const user = db.prepare(`SELECT id FROM users WHERE tg_user_id = ?`).get(tgUserId) as { id: number } | undefined;
  if (!user) return;

  db.exec('BEGIN');
  try {
    for (const table of CHILD_TABLES) {
      if (tableExists(db, table)) {
        db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(user.id);
      }
    }
    db.prepare(`UPDATE users SET deleted_at = ?, username = NULL WHERE id = ?`).run(Date.now(), user.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
