import type { Db } from './connection.js';
import { encryptField } from '../crypto/field.js';
import type { SubmitPayload } from '@stasis/shared';
import type { computeProfile } from '../engine/index.js';

export const ENGINE_VERSION = '2.0.0';

type Profile = ReturnType<typeof computeProfile>;

export function runsRepo(db: Db, encKey: string) {
  const insRun = db.prepare(`INSERT INTO test_runs
    (user_id, content_version, wheel_scores, element_answers, strategy_answers, resource_answers, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insProfile = db.prepare(`INSERT INTO profiles
    (test_run_id, user_id, lead_element, second_element, is_mixed, weak_areas, resource_state,
     belief_card_ids, lead_strategy, second_strategy, is_strategy_mixed, guide_refs,
     engine_version, content_version, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  return {
    saveRun(userId: number, payload: SubmitPayload, profile: Profile, contentVersion: string): { profileId: number } {
      const now = Date.now();
      const enc = (o: unknown) => encryptField(JSON.stringify(o), encKey);
      const run = insRun.run(userId, contentVersion, enc(payload.wheel), enc(payload.elementAnswers),
        enc(payload.strategyAnswers), enc(payload.resourceAnswers), now);
      const testRunId = Number(run.lastInsertRowid);
      const p = insProfile.run(testRunId, userId, profile.leadElement, profile.secondElement ?? null,
        profile.isMixed ? 1 : 0, JSON.stringify(profile.weakAreas), profile.resourceState,
        JSON.stringify(profile.beliefCardIds), profile.leadStrategy, profile.secondStrategy ?? null,
        profile.isStrategyMixed ? 1 : 0, JSON.stringify(profile.guideRefs), ENGINE_VERSION, contentVersion, now);
      return { profileId: Number(p.lastInsertRowid) };
    },
  };
}
