import { createRequire } from 'node:module';
import { runMigrations } from './migrate.js';

// node:sqlite is a builtin only under its prefixed name. Vitest's Vite
// pipeline strips the "node:" prefix and then fails to resolve bare
// "sqlite". Loading it via createRequire at runtime bypasses Vite's static
// resolution entirely (Vite only sees "node:module", a classic builtin it
// handles). In plain Node this is just a normal builtin require.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire('node:sqlite') as typeof import('node:sqlite');

export type Db = InstanceType<typeof DatabaseSync>;

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}
