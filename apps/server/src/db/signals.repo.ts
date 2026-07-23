import type { Db } from './connection.js';

export const SIGNAL_EVENTS = ['not_me', 'barnum_me', 'barnum_generic', 'dropoff', 'share', 'deepen'] as const;
export type SignalEvent = (typeof SIGNAL_EVENTS)[number];

export function isSignalEvent(v: unknown): v is SignalEvent {
  return typeof v === 'string' && (SIGNAL_EVENTS as readonly string[]).includes(v);
}

export function signalsRepo(db: Db) {
  const insert = db.prepare(
    `INSERT INTO signals (user_id, event, meta, created_at) VALUES (?, ?, ?, ?)`
  );

  return {
    record(userId: number, event: SignalEvent, meta?: unknown): void {
      insert.run(userId, event, meta === undefined ? null : JSON.stringify(meta), Date.now());
    },
  };
}
