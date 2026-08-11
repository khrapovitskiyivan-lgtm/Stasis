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

function followUpsColumns(db: Db): string[] {
  return (db.prepare('PRAGMA table_info(follow_ups)').all() as { name: string }[]).map((r) => r.name);
}

function maxVersion(db: Db): number {
  const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null };
  return row.v ?? 0;
}

describe('runMigrations', () => {
  it('brings a fresh db to the latest version with all tables + followups_opt_out column', () => {
    const db = freshDb();
    runMigrations(db);

    expect(maxVersion(db)).toBe(3);

    const tables = tableNames(db);
    for (const t of [
      'users',
      'test_runs',
      'profiles',
      'consents',
      'signals',
      'shares',
      'follow_ups',
      'checkins',
      'schema_version',
    ]) {
      expect(tables).toContain(t);
    }

    expect(usersColumns(db)).toContain('followups_opt_out');
    expect(followUpsColumns(db)).toContain('kind');
  });

  it('is a no-op when run twice (idempotent, no throw, version unchanged)', () => {
    const db = freshDb();
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
    expect(maxVersion(db)).toBe(3);
  });

  it('legacy simulation: applies 002 + 003 onto a pre-002 users table and adds the columns', () => {
    const db = freshDb();
    // Simulate a DB that already ran migration 001 (users table WITHOUT the
    // followups_opt_out column; follow_ups table present, as real 001 creates it).
    db.exec(`
      CREATE TABLE users (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        tg_user_id  INTEGER NOT NULL UNIQUE,
        username    TEXT,
        lang        TEXT,
        created_at  INTEGER NOT NULL,
        deleted_at  INTEGER
      );
      CREATE TABLE follow_ups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        card_ref TEXT NOT NULL,
        step_text TEXT NOT NULL,
        due_at INTEGER NOT NULL,
        sent_at INTEGER,
        response TEXT,
        unsubscribed INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
      INSERT INTO schema_version (version, applied_at) VALUES (1, 0);
    `);
    expect(usersColumns(db)).not.toContain('followups_opt_out');
    expect(followUpsColumns(db)).not.toContain('kind');

    runMigrations(db);

    expect(maxVersion(db)).toBe(3);
    expect(usersColumns(db)).toContain('followups_opt_out');
    expect(followUpsColumns(db)).toContain('kind');
    expect(tableNames(db)).toContain('checkins');
  });

  it('idempotent-002/003 simulation: guards skip the ALTERs when the columns already exist inline', () => {
    const db = freshDb();
    // Simulate a legacy DB whose users/follow_ups tables were created with the
    // columns inline (like today's pre-migration code), already versioned at 1.
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
      CREATE TABLE follow_ups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        card_ref TEXT NOT NULL,
        step_text TEXT NOT NULL,
        due_at INTEGER NOT NULL,
        sent_at INTEGER,
        response TEXT,
        unsubscribed INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        kind TEXT NOT NULL DEFAULT 'step'
      );
      CREATE TABLE schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
      INSERT INTO schema_version (version, applied_at) VALUES (1, 0);
    `);

    expect(() => runMigrations(db)).not.toThrow();
    expect(maxVersion(db)).toBe(3);
    expect(usersColumns(db)).toContain('followups_opt_out');
    expect(followUpsColumns(db)).toContain('kind');
  });
});
