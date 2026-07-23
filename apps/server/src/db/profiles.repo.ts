import type { Db } from './connection.js';
import type { Element } from '@stasis/shared';

export function profilesRepo(db: Db) {
  const selectOwnedLead = db.prepare(
    `SELECT lead_element FROM profiles WHERE id = ? AND user_id = ?`
  );
  return {
    /** lead_element of a profile IFF it belongs to `userId`, else undefined (ownership gate). */
    getOwnedLeadElement(profileId: number, userId: number): Element | undefined {
      const row = selectOwnedLead.get(profileId, userId) as { lead_element: Element } | undefined;
      return row?.lead_element;
    },
  };
}
