/**
 * Canonical id for a memberUserLinks document. Co-locating the helper here
 * keeps the format authoritative across the backend and lets Firestore rules
 * perform an O(1) `exists()` / `get()` check on
 * `memberUserLinks/${userId}_${memberId}` instead of running a query.
 */
export function memberUserLinkId(userId: string, memberId: string): string {
  if (!userId || !memberId) {
    throw new Error('memberUserLinkId requires non-empty userId and memberId.');
  }
  if (userId.includes('_') || memberId.includes('_')) {
    // Firebase Auth UIDs and Firestore document IDs do not contain
    // underscores by default, but if a future ID source ever does we want
    // a hard failure rather than a silent collision.
    throw new Error(
      'memberUserLinkId: ids must not contain underscores (would be ambiguous).',
    );
  }
  return `${userId}_${memberId}`;
}

export function isCanonicalLinkId(
  linkId: string,
  userId: string,
  memberId: string,
): boolean {
  return linkId === `${userId}_${memberId}`;
}

/**
 * Parse a canonical memberUserLinks id back into its (userId, memberId).
 * Returns null when the id does not match the expected format. Used by
 * defensive code paths and tests.
 */
export function parseMemberUserLinkId(
  linkId: string,
): { userId: string; memberId: string } | null {
  const idx = linkId.indexOf('_');
  if (idx <= 0 || idx === linkId.length - 1) return null;
  return {
    userId: linkId.slice(0, idx),
    memberId: linkId.slice(idx + 1),
  };
}
