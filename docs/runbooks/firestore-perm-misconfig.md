# Firestore permission misconfiguration runbook

## Detection

- SLO alert: Firestore permission-denied rate (for signed-in users) >
  2% over 30 min.
- User reports of unexpectedly empty screens after a deploy.
- Spike in callable error rate with `code: permission-denied`.

## Triage

1. Identify whether the spike correlates with a recent deploy of:
   - `firestore/rules/firestore.rules`,
   - the `setUserRole` callable (custom claims),
   - the Flutter app (a stale field name in a query).
2. Inspect the failing operation in Cloud Logging — the rules engine
   logs the rule line that denied the read/write.

## Mitigate

- **If a rules deploy regressed** — roll back via
  `firebase deploy --only firestore:rules` against the previous
  source revision. The `firestore-rules` CI job verifies emulator
  tests still pass before re-applying.
- **If a custom-claim regression** — reset the affected user's claims
  via `setUserRole({granted: true, ...})` and check the audit log for
  the offending change.
- **If a client query regression** — pause the bad app version's
  rollout in App Store Connect / Play Console.

## Investigate

- Run `firestore/tests/` against the deployed rules locally:
  `cd firestore/tests && npm test`. Any newly failing test is the
  regression's signature.
- Verify the intended privacy posture against `docs/privacy.md`.

## Recover

- After re-deploying corrected rules / claims, verify a representative
  read/write succeeds for each role (user, helper, admin) using the
  emulator suite or a smoke test against the dev project.

## Postmortem

- Were the new rules accompanied by an updated emulator test? If not,
  add one before closing the postmortem.
- Did App Check enforcement contribute to the false-positive rate?
