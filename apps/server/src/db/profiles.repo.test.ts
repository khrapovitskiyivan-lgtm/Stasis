import { describe, it, expect } from 'vitest';
import { openDb } from './connection.js';
import { profilesRepo } from './profiles.repo.js';

function seed(db: ReturnType<typeof openDb>, tgId: number, leadElement: string) {
  const now = Date.now();
  const u = db.prepare('INSERT INTO users (tg_user_id, created_at) VALUES (?, ?)').run(tgId, now);
  const userId = Number(u.lastInsertRowid);
  const tr = db
    .prepare(
      `INSERT INTO test_runs (user_id, content_version, wheel_scores, element_answers, strategy_answers, resource_answers, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(userId, 'v1', 'x', 'x', 'x', 'x', now);
  const trId = Number(tr.lastInsertRowid);
  const p = db
    .prepare(
      `INSERT INTO profiles (test_run_id, user_id, lead_element, is_mixed, weak_areas, resource_state,
        belief_card_ids, lead_strategy, is_strategy_mixed, guide_refs, engine_version, content_version, created_at)
       VALUES (?, ?, ?, 0, '[]', 'ok', '[]', 'avoidance', 0, '[]', 'e1', 'v1', ?)`
    )
    .run(trId, userId, leadElement, now);
  return { userId, profileId: Number(p.lastInsertRowid) };
}

describe('profilesRepo.getOwnedLeadElement', () => {
  it('returns lead_element only for the owning user', () => {
    const db = openDb(':memory:');
    const repo = profilesRepo(db);
    const owner = seed(db, 42, 'fire');
    const other = seed(db, 99, 'water');

    expect(repo.getOwnedLeadElement(owner.profileId, owner.userId)).toBe('fire');
    // a different user cannot read someone else's profile
    expect(repo.getOwnedLeadElement(owner.profileId, other.userId)).toBeUndefined();
    // unknown profile id
    expect(repo.getOwnedLeadElement(999999, owner.userId)).toBeUndefined();
  });
});
