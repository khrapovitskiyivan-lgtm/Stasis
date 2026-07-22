import { describe, it, expect } from 'vitest';
import { openDb } from './connection.js';
import { usersRepo } from './users.repo.js';

describe('usersRepo', () => {
  it('upserts by tgUserId idempotently and reads back', () => {
    const db = openDb(':memory:');
    const repo = usersRepo(db);
    const a = repo.upsertByTgId(4242, 'ivan', 'ru');
    const b = repo.upsertByTgId(4242, 'ivan_new', 'ru');
    expect(a.id).toBe(b.id); // same user, not duplicated
    const row = repo.getByTgId(4242);
    expect(row?.tgUserId).toBe(4242);
    expect(row?.username).toBe('ivan_new'); // username refreshed
  });

  it('returns undefined for unknown user', () => {
    const db = openDb(':memory:');
    expect(usersRepo(db).getByTgId(999)).toBeUndefined();
  });
});
