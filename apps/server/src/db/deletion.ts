import type { Db } from './connection.js';

// Child tables that reference users.id and exist as of this task. `follow_ups`
// and `shares` land in later phase-4 tasks; guarded by an existence check so
// this keeps working once they're added without another migration to this file.
// Order matters: profiles.test_run_id references test_runs(id), so profiles
// must go first or the FK constraint rejects the test_runs delete.
const CHILD_TABLES = ['profiles', 'test_runs', 'consents', 'signals', 'follow_ups', 'shares'] as const;

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
