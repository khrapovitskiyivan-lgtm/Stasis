import type { Db } from './connection.js';

export function runMigrations(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_user_id  INTEGER NOT NULL UNIQUE,
      username    TEXT,
      lang        TEXT,
      created_at  INTEGER NOT NULL,
      deleted_at  INTEGER,
      followups_opt_out INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      content_version TEXT NOT NULL,
      wheel_scores TEXT NOT NULL, element_answers TEXT NOT NULL,
      strategy_answers TEXT NOT NULL, resource_answers TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_run_id INTEGER NOT NULL REFERENCES test_runs(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      lead_element TEXT NOT NULL, second_element TEXT, is_mixed INTEGER NOT NULL,
      weak_areas TEXT NOT NULL, resource_state TEXT NOT NULL, belief_card_ids TEXT NOT NULL,
      lead_strategy TEXT NOT NULL, second_strategy TEXT, is_strategy_mixed INTEGER NOT NULL,
      guide_refs TEXT NOT NULL,
      engine_version TEXT NOT NULL, content_version TEXT NOT NULL, created_at INTEGER NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      event TEXT NOT NULL,
      meta TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  db.exec(`CREATE TABLE IF NOT EXISTS consents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL, doc_version TEXT NOT NULL, granted_at INTEGER NOT NULL
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS shares (
    slug TEXT PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES profiles(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    public_payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    revoked_at INTEGER
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS follow_ups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    card_ref TEXT NOT NULL,
    step_text TEXT NOT NULL,
    due_at INTEGER NOT NULL,
    sent_at INTEGER,
    response TEXT,
    unsubscribed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );`);
}
