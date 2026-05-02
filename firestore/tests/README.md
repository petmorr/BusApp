# Firestore rules integration tests

Black-box tests that boot the Firestore emulator and exercise
`firestore/rules/firestore.rules` from the perspective of authenticated
users with various roles. They use
[`@firebase/rules-unit-testing`](https://firebase.google.com/docs/rules/unit-tests)
and are the integration counterpart to the unit tests in `functions/test/`.

## What is covered

- **`memberResponses.test.ts`** — linked vs unlinked member response writes,
  pending-link writes (must be blocked), spoofed `respondingUserId` and
  client-side `isAdminOverride`, admin overrides, read access for linked vs
  unrelated users.
- **`guestRequests.test.ts`** — pending guest creation by the requester,
  client-side approval bypass attempts, edits and cancellation while
  pending, edits to other users' requests (must be blocked), edits after
  approval (must be blocked).
- **`helpers_assignment.test.ts`** — assigned helper updating
  `parkedBusLocation` and stops, attempts to change unrelated event fields
  or delete stops, unassigned helper attempts.
- **`admin.test.ts`** — member directory privacy, canonical
  `memberUserLinks` id enforcement, attempts to self-activate a pending
  link, audit log read/write protection, notification write protection,
  event create/delete admin-only.

## Running

Requires the Firebase emulator (Java 11+).

```bash
cd firestore/tests
npm install --legacy-peer-deps
npm test
```

This installs `firebase-tools`, `@firebase/rules-unit-testing` and `jest`,
then boots the Firestore emulator on port 8088 and runs all four suites.

## CI

The GitHub Actions workflow at `.github/workflows/ci.yml` includes a
`firestore-rules` job that runs these tests on every push and pull request.
