import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { runMigrations } from './migrate.js';
import type { Db } from './connection.js';

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire('node:sqlite') as typeof import('node:sqlite');

function freshDb(): Db {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

function tableNames(db: Db): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
    (r) => r.name
  );
}

function usersColumns(db: Db): string[] {
  return (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((r) => r.name);
}

function maxVersion(db: Db): number {
  const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null };
  return row.v ?? 0;
}

describe('runMigrations', () => {
  it('brings a fresh db to the latest version with all tables + followups_opt_out column', () => {
    const db = freshDb();
    runMigrations(db);

    expect(maxVersion(db)).toBe(2);

    const tables = tableNames(db);
    for (const t of [
      'users',
      'test_runs',
      'profiles',
      'consents',
      'signals',
      'shares',
      'follow_ups',
      'schema_version',
    ]) {
      expect(tables).toContain(t);
    }

    expect(usersColumns(db)).toContain('followups_opt_out');
  });

  it('is a no-op when run twice (idempotent, no throw, version unchanged)', () => {
    const db = freshDb();
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
    expect(maxVersion(db)).toBe(2);
  });

  it('legacy simulation: applies only 002 onto a pre-002 users table and adds the column', () => {
    const db = freshDb();
    // Simulate a DB that already ran migration 001 (users table WITHOUT the column).
    db.exec(`
      CREATE TABLE users (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        tg_user_id  INTEGER NOT NULL UNIQUE,
        username    TEXT,
        lang        TEXT,
        created_at  INTEGER NOT NULL,
        deleted_at  INTEGER
      );
      CREATE TABLE schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
      INSERT INTO schema_version (version, applied_at) VALUES (1, 0);
    `);
    expect(usersColumns(db)).not.toContain('followups_opt_out');

    runMigrations(db);

    expect(maxVersion(db)).toBe(2);
    expect(usersColumns(db)).toContain('followups_opt_out');
  });

  it('idempotent-002 simulation: guard skips the ALTER when the column already exists inline', () => {
    const db = freshDb();
    // Simulate a legacy DB whose users table was created with the column inline
    // (like today's pre-migration code), already versioned at 1.
    db.exec(`
      CREATE TABLE users (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        tg_user_id  INTEGER NOT NULL UNIQUE,
        username    TEXT,
        lang        TEXT,
        created_at  INTEGER NOT NULL,
        deleted_at  INTEGER,
        followups_opt_out INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
      INSERT INTO schema_version (version, applied_at) VALUES (1, 0);
    `);

    expect(() => runMigrations(db)).not.toThrow();
    expect(maxVersion(db)).toBe(2);
    expect(usersColumns(db)).toContain('followups_opt_out');
  });
});
