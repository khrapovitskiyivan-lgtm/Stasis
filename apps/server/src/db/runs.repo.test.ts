import { describe, it, expect } from 'vitest';
import { openDb } from './connection.js';
import { usersRepo } from './users.repo.js';
import { runsRepo } from './runs.repo.js';

const ENC = 'a'.repeat(64);
const payload = { wheel: {}, elementAnswers: {}, strategyAnswers: {}, resourceAnswers: {} } as any;

function baseProfile(overrides: Record<string, unknown> = {}) {
  return {
    leadElement: 'earth', secondElement: null, elementState: 'confident',
    weakAreas: [], resourceState: 'ok', beliefCardIds: [],
    leadStrategy: 'avoidance', secondStrategy: null, strategyState: 'confident', guideRefs: [],
    ...overrides,
  } as any;
}

function readDeterminacy(db: ReturnType<typeof openDb>, profileId: number) {
  return db.prepare('SELECT is_mixed, is_strategy_mixed FROM profiles WHERE id = ?').get(profileId) as {
    is_mixed: number;
    is_strategy_mixed: number;
  };
}

function saveProfile(db: ReturnType<typeof openDb>, tgId: number, profile: ReturnType<typeof baseProfile>) {
  const { id: userId } = usersRepo(db).upsertByTgId(tgId, 'u', 'ru');
  const { profileId } = runsRepo(db, ENC).saveRun(userId, payload, profile, 'v1');
  return readDeterminacy(db, profileId);
}

describe('runsRepo.saveRun — is_mixed / is_strategy_mixed persist "lead not decisive"', () => {
  it('persists 0/0 for a fully confident profile', () => {
    const db = openDb(':memory:');
    const row = saveProfile(db, 1, baseProfile());
    expect(row.is_mixed).toBe(0);
    expect(row.is_strategy_mixed).toBe(0);
  });

  it('persists is_mixed = 1 when elementState is "none" (flat profile is NOT decisive)', () => {
    const db = openDb(':memory:');
    const row = saveProfile(db, 2, baseProfile({ elementState: 'none' }));
    expect(row.is_mixed).toBe(1);
    expect(row.is_strategy_mixed).toBe(0); // strategy axis unaffected
  });

  it('persists is_mixed = 1 when elementState is "mixed" (two-way tie is also NOT decisive)', () => {
    const db = openDb(':memory:');
    const row = saveProfile(db, 3, baseProfile({ elementState: 'mixed' }));
    expect(row.is_mixed).toBe(1);
  });

  it('persists is_strategy_mixed = 1 when strategyState is "none"', () => {
    const db = openDb(':memory:');
    const row = saveProfile(db, 4, baseProfile({ strategyState: 'none' }));
    expect(row.is_strategy_mixed).toBe(1);
    expect(row.is_mixed).toBe(0); // element axis unaffected
  });

  it('persists is_strategy_mixed = 1 when strategyState is "mixed"', () => {
    const db = openDb(':memory:');
    const row = saveProfile(db, 5, baseProfile({ strategyState: 'mixed' }));
    expect(row.is_strategy_mixed).toBe(1);
  });
});
