# Privacy posture

Personal data in this app is intentionally minimal: names, phone numbers,
member-to-user links, attendance records, guest names, and operational
notes. This document captures the access decisions that back that policy.
The Firestore rules at `firestore/rules/firestore.rules` are the source of
truth; this doc explains the *why*.

## Member directory

| Audience | Read a single `members/{id}` | List the full directory | Write |
|----------|------------------------------|--------------------------|-------|
| Admin    | yes | yes | yes |
| Helper   | only members they have a `memberUserLink` to (i.e. self / dependents) | no | no |
| User     | only members they have a `memberUserLink` to (i.e. self / dependents) | no | no |

**Why not let any signed-in user browse the member list?** The supporters
group is small (~60 members) and members are only loosely a "public" group.
Phone numbers and any future accessibility / emergency-contact notes
(`generalNotes`) are sensitive. Restricting reads to `members/{id}` documents
that the caller has a link to lets the app render *the represented members*
(self + children/dependents) without exposing the full directory to every
account.

This is enforced by:

```
match /members/{memberId} {
  allow get: if isAdmin() || userHasLinkDocFor(memberId);
  allow list: if isAdmin();
  allow create, update, delete: if isAdmin();
}
```

Where `userHasLinkDocFor(memberId)` does an O(1)
`exists(/memberUserLinks/${uid}_${memberId})` lookup using the canonical
link-document id format (see [Schema invariants](#schema-invariants)).

The admin attendance board still works because admins read events,
`memberResponses`, and `members` directly. Helpers see only their assigned
events; they do not need broad member directory access for parked-bus and
operational updates.

## Member responses and guest requests

- A user may **read** a `memberResponses/{memberId}` document only when they
  hold any link doc to that member. We use *any* link doc (rather than
  *active*) so users with a pending self-link can still see their own
  in-progress data; an admin still has to approve the link before the user
  can submit a response.
- A user may **write** a `memberResponses/{memberId}` document only when
  they hold an *active* link to that member, and only when the response's
  `respondingUserId` matches their own UID.
- A user may **read** their own `guestRequests` only.
- A user may **edit** their own `guestRequests` only while the request is
  still `pending`. Approve / reject is admin-only and goes through the
  callable Cloud Functions.

## Notifications and audit logs

- `notifications/{id}` documents include a `targetUserIds` array. A user
  can read a notification only when their UID is in that list.
- `auditLogs/{id}` is admin-read-only and write-only via Cloud Functions.
- FCM tokens live under `users/{uid}/fcmTokens/{tokenId}` and are
  read/write by the owning user only.

## Schema invariants

`memberUserLinks/{linkId}` documents MUST be created with
`linkId === ${userId}_${memberId}` (see `functions/src/utils/links.ts`).
This is enforced in three places:

1. The Firestore rule on `memberUserLinks` `create` checks
   `linkId == request.resource.data.userId + '_' + request.resource.data.memberId`.
2. The `approveMemberUserLink` Cloud Function rejects any pending document
   whose id does not match the format.
3. User-initiated link creation goes exclusively through the
   `requestMemberLinkByNumber` Cloud Function, which computes
   `${uid}_${memberId}` server-side — the app never writes to
   `memberUserLinks` directly.

This invariant is what lets the rule layer answer *"is this user linked to
that member?"* with a single `exists()` call — no query, no extra index, no
race window.

## Location and tracking

- The app **does not** continuously track location.
- GPS is captured only when an admin/helper explicitly pins the parked-bus
  location (foreground permission only).
- Stop coordinates are stored only when admins enter them.

## Data minimisation

The schema deliberately omits:

- email addresses (no email is required to log in),
- payment / billing data,
- social / chat content,
- live-tracking traces.

Should the group later need any of these, they should be added behind the
existing role model with their own privacy review.
