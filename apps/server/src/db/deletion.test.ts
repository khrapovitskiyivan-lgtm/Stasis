import { describe, it, expect } from 'vitest';
import { openDb } from './connection.js';
import { usersRepo } from './users.repo.js';
import { runsRepo } from './runs.repo.js';
import { consentsRepo } from './consents.repo.js';
import { deleteUserData } from './deletion.js';

const ENC = 'a'.repeat(64);

function seed(db: ReturnType<typeof openDb>) {
  const users = usersRepo(db);
  const { id: userId } = users.upsertByTgId(4242, 'ivan', 'ru');
  const runs = runsRepo(db, ENC);
  const profile = {
    leadElement: 'earth', secondElement: null, isMixed: false,
    weakAreas: [], resourceState: 'ok', beliefCardIds: [],
    leadStrategy: 'a', secondStrategy: null, isStrategyMixed: false, guideRefs: [],
  } as any;
  const { profileId } = runs.saveRun(
    userId,
    { wheel: {}, elementAnswers: {}, strategyAnswers: {}, resourceAnswers: {} } as any,
    profile,
    'v1'
  );
  consentsRepo(db).record(userId, 'v1');
  // A share references profiles(id) via FK — exercises the delete-order (shares before profiles).
  db.prepare('INSERT INTO shares (slug, profile_id, user_id, public_payload, created_at) VALUES (?, ?, ?, ?, ?)')
    .run('slug-abc', profileId, userId, '{}', Date.now());
  return { userId, profileId };
}

describe('deleteUserData', () => {
  it('hard-deletes test_runs/profiles/consents rows and soft-deletes the user', () => {
    const db = openDb(':memory:');
    const { userId } = seed(db);

    expect((db.prepare('SELECT COUNT(*) c FROM test_runs WHERE user_id = ?').get(userId) as any).c).toBe(1);
    expect((db.prepare('SELECT COUNT(*) c FROM profiles WHERE user_id = ?').get(userId) as any).c).toBe(1);
    expect((db.prepare('SELECT COUNT(*) c FROM consents WHERE user_id = ?').get(userId) as any).c).toBe(3);
    expect((db.prepare('SELECT COUNT(*) c FROM shares WHERE user_id = ?').get(userId) as any).c).toBe(1);

    deleteUserData(db, 4242); // must NOT throw despite the shares->profiles FK

    expect((db.prepare('SELECT COUNT(*) c FROM test_runs WHERE user_id = ?').get(userId) as any).c).toBe(0);
    expect((db.prepare('SELECT COUNT(*) c FROM profiles WHERE user_id = ?').get(userId) as any).c).toBe(0);
    expect((db.prepare('SELECT COUNT(*) c FROM consents WHERE user_id = ?').get(userId) as any).c).toBe(0);
    expect((db.prepare('SELECT COUNT(*) c FROM shares WHERE user_id = ?').get(userId) as any).c).toBe(0);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    expect(user.deleted_at).not.toBeNull();
    expect(user.username).toBeNull();
  });

  it('records a signal row deletion too', () => {
    const db = openDb(':memory:');
    const { userId } = seed(db);
    db.prepare('INSERT INTO signals (user_id, event, meta, created_at) VALUES (?, ?, ?, ?)').run(userId, 'share', null, Date.now());
    expect((db.prepare('SELECT COUNT(*) c FROM signals WHERE user_id = ?').get(userId) as any).c).toBe(1);

    deleteUserData(db, 4242);

    expect((db.prepare('SELECT COUNT(*) c FROM signals WHERE user_id = ?').get(userId) as any).c).toBe(0);
  });

  it('is a no-op for an unknown tg user id', () => {
    const db = openDb(':memory:');
    expect(() => deleteUserData(db, 999999)).not.toThrow();
  });
});
