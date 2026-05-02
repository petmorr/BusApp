# End-to-end tests

Black-box tests against the full Firebase emulator stack
(**auth + firestore + functions**). They exercise the deployed callables and
triggers from the perspective of authenticated users with various roles,
covering the cross-component flows that the rule-only and unit-only tests
cannot.

## What is covered

- **`login_and_profile.test.ts`** — first-time user creates `users/{uid}`,
  requests a pending `memberUserLink` with the canonical id, admin
  approves the link, the member becomes readable to the user. Also
  asserts non-canonical link ids are rejected at the rule layer.
- **`response_submission.test.ts`** — a user with an active link submits a
  member response, the capacity trigger updates the event totals; users
  without an active link or trying to respond for an unrelated member
  are rejected.
- **`guest_decision.test.ts`** — admin approves a pending guest request,
  the document updates, an audit log entry (with PII redacted) and a
  notification document are written. Idempotent replay returns the
  cached result and does not send a second notification. Conflicting
  decisions (approve then reject) fail with `failed-precondition`. The
  payload validator rejects unknown extra fields.
- **`helper_operational_update.test.ts`** — assigned helper pins
  parked-bus location (lat/lng redacted in the audit log), unassigned
  helper is rejected, admin can send an operational update without an
  assignment, validator rejects out-of-range latitude.

## How it works

1. `firebase emulators:exec` boots Auth (port 9099), Firestore
   (port 8080) and Functions (port 5001) for project
   `supporters-bus-e2e`.
2. The Cloud Functions runtime loads `functions/.env.supporters-bus-e2e`
   which sets `BYPASS_APP_CHECK=true` so callables accept calls from
   the emulator-resident SDKs.
3. `helpers.ts#makeCaller(uid, {admin?, helper?})` mints a Firebase
   Auth user with the given custom claims, mints a custom token,
   signs the firebase JS SDK in with it, and returns a `Caller` that
   exposes a Firestore handle and a `callable(name, payload)` helper.
4. `helpers.ts#getAdmin()` returns a privileged `firebase-admin` SDK
   that talks straight to the emulator (rules-bypassed), used for
   seeding state and for asserting on the side effects.
5. Each `beforeEach` calls `resetEmulators()` which deletes every
   Firestore document and every Auth user — tests start from a clean
   slate.

## Running

Requires Node 20, Java 17 (Firestore emulator), and the rest of the
dependencies installed:

```bash
cd e2e
npm install --legacy-peer-deps
npm test
```

The script first builds the functions (`npm --prefix ../functions run
build`) so the emulator picks up the latest TypeScript output.

## CI

The GitHub Actions workflow at `.github/workflows/ci.yml` includes an
`e2e` job that runs the suite on every push and pull request.
