# ADR 0001 — Canonical `memberUserLinks` document id

- **Status**: accepted
- **Date**: 2026-05-02

## Context

Firestore security rules need to answer "is this user linked to that
member?" frequently:

- when a user reads `members/{memberId}` (privacy posture for the
  directory, see `docs/privacy.md`);
- when a user reads or writes
  `events/{eventId}/memberResponses/{memberId}`.

Firestore rules do not support efficient queries from the rule layer —
the only cross-collection primitives are `exists()` and `get()` against a
known document path. A `where(...).limit(1).get()` style query inside a
rule is not available.

## Decision

Every `memberUserLinks` document MUST be created with the canonical
document id `${userId}_${memberId}`. The format is enforced in three
layers, each defending against a different failure mode:

1. **Firestore rule layer** — `memberUserLinks` `create` requires
   `linkId == request.resource.data.userId + '_' + request.resource.data.memberId`
   for both admin creates and user-initiated signup self-links.
2. **Cloud Function layer** — `approveMemberUserLink` re-validates the id
   against the document's stored `userId` and `memberId` before flipping
   `status` to `active`. This catches links smuggled in via privileged
   admin SDK paths (e.g. the import script) that bypass rules.
3. **Application layer** — `MemberUserLink.idFor(userId, memberId)` and
   `functions/src/utils/links.ts#memberUserLinkId(userId, memberId)`
   are the only ways the production code constructs the id. Both reject
   empty inputs and inputs containing underscores so a future id source
   that introduces underscores fails loudly rather than silently
   colliding.

## Consequences

- **Positive** — `userHasLinkDocFor(memberId)` is a single
  `exists(/memberUserLinks/${uid}_${memberId})` and runs in O(1) without
  an additional index. Authorization decisions become local to the rule.
- **Positive** — the `(userId, memberId)` pair is unique by construction;
  no race window between two writers.
- **Negative** — the format is now load-bearing and must remain stable.
  Renaming the convention would require a migration. The convention is
  documented here, in `docs/privacy.md`, and inline in
  `functions/src/utils/links.ts`.
- **Follow-up** — the bulk-import script will be updated to use the
  canonical id when it grows the ability to seed `memberUserLinks` (it
  currently only seeds members).

## Alternatives considered

- **Composite query inside rules** — not supported by Firestore.
- **Maintain a separate `userMembers/{uid}/memberIds/{memberId}` index** —
  works but requires every write path to keep the index in sync, which
  is a larger surface area for bugs than enforcing one document id
  format.

## References

- `firestore/rules/firestore.rules`
- `functions/src/utils/links.ts`
- `app/lib/data/models/member_user_link.dart`
- `docs/privacy.md`
