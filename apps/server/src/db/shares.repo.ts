import { nanoid } from 'nanoid';
import type { Db } from './connection.js';
import type { SharePublicPayload } from '@stasis/shared';

export function sharesRepo(db: Db) {
  const insert = db.prepare(
    `INSERT INTO shares (slug, profile_id, user_id, public_payload, created_at) VALUES (?, ?, ?, ?, ?)`
  );
  // Public reads must exclude revoked shares.
  const selectBySlug = db.prepare(`SELECT public_payload FROM shares WHERE slug = ? AND revoked_at IS NULL`);
  const revokeStmt = db.prepare(`UPDATE shares SET revoked_at = ? WHERE slug = ? AND user_id = ?`);

  return {
    create(profileId: number, userId: number, payload: SharePublicPayload): { slug: string } {
      // nanoid(12) — non-enumerable, ~72 bits of entropy per id.
      const slug = nanoid(12);
      insert.run(slug, profileId, userId, JSON.stringify(payload), Date.now());
      return { slug };
    },
    getBySlug(slug: string): { publicPayload: SharePublicPayload } | undefined {
      const row = selectBySlug.get(slug) as { public_payload: string } | undefined;
      if (!row) return undefined;
      return { publicPayload: JSON.parse(row.public_payload) as SharePublicPayload };
    },
    revoke(slug: string, userId: number): void {
      revokeStmt.run(Date.now(), slug, userId);
    },
  };
}
