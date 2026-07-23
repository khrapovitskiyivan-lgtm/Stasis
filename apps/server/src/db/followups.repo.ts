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
}

export function followUpsRepo(db: Db, encKey: string) {
  const insert = db.prepare(
    `INSERT INTO follow_ups (user_id, card_ref, step_text, due_at, unsubscribed, created_at) VALUES (?, ?, ?, ?, ?, ?)`
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

  const map = (r: any): FollowUpRow => ({
    id: r.id,
    userId: r.user_id,
    cardRef: r.card_ref,
    stepText: decryptField(r.step_text, encKey),
    dueAt: r.due_at,
    sentAt: r.sent_at,
    response: r.response,
  });

  return {
    schedule(userId: number, cardRef: string, stepText: string, dueAt: number): { id: number } {
      // Respect a persisted opt-out: schedule the row already unsubscribed so due() never picks it.
      const optedOut = (optedOutStmt.get(userId) as { followups_opt_out?: number } | undefined)?.followups_opt_out === 1;
      const res = insert.run(userId, cardRef, encryptField(stepText, encKey), dueAt, optedOut ? 1 : 0, Date.now());
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
  };
}
