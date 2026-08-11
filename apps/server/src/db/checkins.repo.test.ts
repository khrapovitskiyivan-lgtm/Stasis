import { describe, it, expect } from 'vitest';
import { openDb } from './connection.js';
import { runMigrations } from './migrate.js';
import { checkinsRepo } from './checkins.repo.js';

const ENC = '00'.repeat(32);
function seedUser(db: ReturnType<typeof openDb>): number {
  db.prepare('INSERT INTO users (tg_user_id, created_at) VALUES (?, ?)').run(777, 1);
  return (db.prepare('SELECT id FROM users WHERE tg_user_id=?').get(777) as { id: number }).id;
}
const wheel = { health: 5, family: 5, rest: 5, friends: 5, career: 5, hobby: 5 };

describe('checkinsRepo', () => {
  it('round-trips a checkin, decrypting wheel/energy/note; step_outcome stored plaintext', () => {
    const db = openDb(':memory:'); runMigrations(db);
    const uid = seedUser(db);
    const repo = checkinsRepo(db, ENC);
    repo.save(uid, { wheel: { ...wheel, career: 3 }, energy: 4, stepRef: null, stepOutcome: 'partial', note: 'секрет' }, 1000);
    const rows = repo.history(uid);
    expect(rows).toHaveLength(1);
    expect(rows[0].wheel.career).toBe(3);
    expect(rows[0].energy).toBe(4);
    expect(rows[0].stepOutcome).toBe('partial');
    expect(rows[0].note).toBe('секрет');
    // note is encrypted at rest, not plaintext
    const raw = db.prepare('SELECT note, step_outcome FROM checkins WHERE id=?').get(rows[0].id) as any;
    expect(raw.note).not.toContain('секрет');
    expect(raw.step_outcome).toBe('partial');
  });

  it('history is ascending by created_at', () => {
    const db = openDb(':memory:'); runMigrations(db);
    const uid = seedUser(db);
    const repo = checkinsRepo(db, ENC);
    repo.save(uid, { wheel, energy: 5, stepRef: null, stepOutcome: 'done', note: null }, 2000);
    repo.save(uid, { wheel, energy: 5, stepRef: null, stepOutcome: 'done', note: null }, 1000);
    expect(repo.history(uid).map((r) => r.createdAt)).toEqual([1000, 2000]);
  });
});
