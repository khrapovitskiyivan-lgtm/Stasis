import type { Db } from './connection.js';

export const CONSENT_KINDS = ['pdn', 'psych', 'age18'] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

export function consentsRepo(db: Db) {
  const insert = db.prepare(
    `INSERT INTO consents (user_id, kind, doc_version, granted_at) VALUES (?, ?, ?, ?)`
  );

  return {
    record(userId: number, docVersion: string): void {
      const now = Date.now();
      for (const kind of CONSENT_KINDS) {
        insert.run(userId, kind, docVersion, now);
      }
    },
  };
}
