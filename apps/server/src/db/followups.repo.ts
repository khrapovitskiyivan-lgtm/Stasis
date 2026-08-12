import type { Db } from './connection.js';
import { encryptField, decryptField } from '../crypto/field.js';

export interface FollowUpRow {
  id: number;
  userId: number;
  cardRef: string;
  stepText: string;
  dueAt: number;
  sentAt: number | null;
  response: string | null;
  kind: string;
}

export function followUpsRepo(db: Db, encKey: string) {
  const insert = db.prepare(
    `INSERT INTO follow_ups (user_id, card_ref, step_text, due_at, unsubscribed, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  // Only rows that are due, unsent, and not from an unsubscribed user.
  const selectDue = db.prepare(
    `SELECT * FROM follow_ups WHERE due_at <= ? AND sent_at IS NULL AND unsubscribed = 0`
  );
  const markSentStmt = db.prepare(`UPDATE follow_ups SET sent_at = ? WHERE id = ?`);
  // Opt-out persists on the user (survives future schedules), and existing
  // pending rows are flipped so already-scheduled nudges don't fire either.
  const optedOutStmt = db.prepare(`SELECT followups_opt_out FROM users WHERE id = ?`);
  const setOptOutStmt = db.prepare(`UPDATE users SET followups_opt_out = 1 WHERE id = ?`);
  const unsubscribeStmt = db.prepare(
    `UPDATE follow_ups SET unsubscribed = 1 WHERE user_id = ? AND sent_at IS NULL`
  );
  const recordReplyStmt = db.prepare(`UPDATE follow_ups SET response = ? WHERE id = ?`);
  const selectLatestStep = db.prepare(
    `SELECT card_ref, step_text FROM follow_ups WHERE user_id = ? AND kind = 'step' ORDER BY created_at DESC LIMIT 1`
  );

  const map = (r: any): FollowUpRow => ({
    id: r.id,
    userId: r.user_id,
    cardRef: r.card_ref,
    stepText: decryptField(r.step_text, encKey),
    dueAt: r.due_at,
    sentAt: r.sent_at,
    response: r.response,
    kind: r.kind,
  });

  return {
    schedule(userId: number, cardRef: string, stepText: string, dueAt: number): { id: number } {
      // Respect a persisted opt-out: schedule the row already unsubscribed so due() never picks it.
      const optedOut = (optedOutStmt.get(userId) as { followups_opt_out?: number } | undefined)?.followups_opt_out === 1;
      const res = insert.run(userId, cardRef, encryptField(stepText, encKey), dueAt, optedOut ? 1 : 0, 'step', Date.now());
      return { id: Number(res.lastInsertRowid) };
    },
    // Schedules a "how are you doing" check-in nudge (no step text attached).
    // Same opt-out gating as schedule() so a silenced user stays silenced.
    scheduleCheckin(userId: number, dueAt: number): { id: number } {
      const optedOut = (optedOutStmt.get(userId) as { followups_opt_out?: number } | undefined)?.followups_opt_out === 1;
      const res = insert.run(userId, 'checkin', encryptField('', encKey), dueAt, optedOut ? 1 : 0, 'checkin', Date.now());
      return { id: Number(res.lastInsertRowid) };
    },
    due(now: number): FollowUpRow[] {
      return (selectDue.all(now) as any[]).map(map);
    },
    markSent(id: number): void {
      markSentStmt.run(Date.now(), id);
    },
    unsubscribe(userId: number): void {
      setOptOutStmt.run(userId); // persist opt-out so future schedules stay silent
      unsubscribeStmt.run(userId); // and cancel any already-pending nudges
    },
    recordReply(id: number, reply: string): void {
      recordReplyStmt.run(reply, id);
    },
    // Most recently scheduled "step" nudge for a user (memory anchor for GET
    // /checkin) — null if none. Deliberately not the `due`/`sent` state: the
    // step itself, regardless of whether its reminder already fired.
    latestStep(userId: number): { text: string; cardRef: string } | null {
      const row = selectLatestStep.get(userId) as { card_ref: string; step_text: string } | undefined;
      if (!row) return null;
      return { text: decryptField(row.step_text, encKey), cardRef: row.card_ref };
    },
  };
}
