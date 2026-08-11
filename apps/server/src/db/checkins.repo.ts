import type { Db } from './connection.js';
import type { WheelScores } from '@stasis/shared';
import { encryptField, decryptField } from '../crypto/field.js';

export type StepOutcome = 'done' | 'partial' | 'missed' | 'changed';
export interface CheckinInput { wheel: WheelScores; energy: number; stepRef: number | null; stepOutcome: StepOutcome | null; note: string | null }
export interface CheckinRow { id: number; userId: number; createdAt: number; wheel: WheelScores; energy: number; stepRef: number | null; stepOutcome: StepOutcome | null; note: string | null }

export function checkinsRepo(db: Db, encKey: string) {
  const ins = db.prepare(
    `INSERT INTO checkins (user_id, created_at, wheel_scores, energy, step_ref, step_outcome, note) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const selHistory = db.prepare(`SELECT * FROM checkins WHERE user_id = ? ORDER BY created_at ASC`);
  const enc = (o: unknown) => encryptField(JSON.stringify(o), encKey);

  const map = (r: any): CheckinRow => ({
    id: r.id, userId: r.user_id, createdAt: r.created_at,
    wheel: JSON.parse(decryptField(r.wheel_scores, encKey)) as WheelScores,
    energy: JSON.parse(decryptField(r.energy, encKey)) as number,
    stepRef: r.step_ref, stepOutcome: r.step_outcome, note: r.note ? decryptField(r.note, encKey) : null,
  });

  return {
    save(userId: number, input: CheckinInput, now: number): { id: number } {
      const res = ins.run(userId, now, enc(input.wheel), enc(input.energy), input.stepRef,
        input.stepOutcome, input.note ? encryptField(input.note, encKey) : null);
      return { id: Number(res.lastInsertRowid) };
    },
    history(userId: number): CheckinRow[] {
      return (selHistory.all(userId) as any[]).map(map);
    },
  };
}
