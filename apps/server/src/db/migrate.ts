import type { Db } from './connection.js';

export function runMigrations(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_user_id  INTEGER NOT NULL UNIQUE,
      username    TEXT,
      lang        TEXT,
      created_at  INTEGER NOT NULL,
      deleted_at  INTEGER
    );
  `);
}
