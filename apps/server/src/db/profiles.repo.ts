import type { Db } from './connection.js';
import type { Element } from '@stasis/shared';

export function profilesRepo(db: Db) {
  const selectOwnedLead = db.prepare(
    `SELECT lead_element FROM profiles WHERE id = ? AND user_id = ?`
  );
  // resource_state is stored plaintext (see runs.repo.ts saveRun) — safe to read directly.
  const selectLatestResourceState = db.prepare(
    `SELECT resource_state FROM profiles WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`
  );
  return {
    /** lead_element of a profile IFF it belongs to `userId`, else undefined (ownership gate). */
    getOwnedLeadElement(profileId: number, userId: number): Element | undefined {
      const row = selectOwnedLead.get(profileId, userId) as { lead_element: Element } | undefined;
      return row?.lead_element;
    },
    /** Most recent profile's resource_state for a user, or undefined if they have none yet. */
    latestResourceState(userId: number): 'ok' | 'low' | 'critical' | undefined {
      const row = selectLatestResourceState.get(userId) as { resource_state: 'ok' | 'low' | 'critical' } | undefined;
      return row?.resource_state;
    },
  };
}
