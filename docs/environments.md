# Environments and deployment governance

This project uses a strict **dev / stage / prod** separation. Each
environment is its own Firebase project with its own service accounts,
custom claims, and FCM credentials; there is no shared state.

## Projects

| Environment | Firebase project id (default) | Purpose |
|-------------|------------------------------|---------|
| dev | `supporters-bus-dev` | Day-to-day development. TestFlight / Play internal testing. Seeded with synthetic members. |
| stage | `supporters-bus-stage` | Pre-release rehearsal. Mirrors prod configuration; may seed anonymised member data. |
| prod | `supporters-bus-prod` | Live deployment used by the supporters group. |

The mapping is set in `.firebaserc` (see `.firebaserc.example`). Switch
environments with `firebase use <env>`.

## IAM

- Each environment has its own Firebase Owner / Editor list. Access is
  granted per-person, never via shared accounts.
- The `firebase-tools` service account used by CI for production deploys
  has **only** the roles required for the deploy: `roles/cloudfunctions.developer`,
  `roles/firebase.developAdmin`, `roles/datastore.user`. It cannot read
  user data or read/write Firebase Auth.
- Custom claims (`admin: true`, `helper: true`) are granted only via the
  `setUserRole` callable, which writes an `auditLogs` entry. Claims must
  be re-certified quarterly (see "Privileged-claim recertification" in
  `docs/runbooks/privileged-access.md`).

## Deploy gates

Production deploys are gated on:

1. **Branch protection** — `main` is protected; merges require a passing
   CI run (Cloud Functions tests, Flutter analyze + tests, Firestore
   rules emulator tests).
2. **Manual approval** — production deploy is triggered manually from a
   tagged release. The dev and stage projects deploy automatically on
   merge to `main`.
3. **App Check** — production callables enforce App Check.
   `BYPASS_APP_CHECK=true` is set only in the integration-test
   environment.
4. **Backups** — Firestore scheduled exports must be configured on the
   production project before the first prod deploy.

## Secrets

- Firebase Admin service-account keys for the import script are stored
  outside the repository (1Password / Secret Manager) and rotated
  whenever an admin leaves the team.
- FCM server keys are managed by Firebase itself; no secret material is
  stored in the repo.
- The repository deliberately omits `.firebaserc` and any
  platform-specific Firebase config files; each environment generates
  them via `flutterfire configure`.

## Configuration drift

`firebase deploy --only firestore:rules,firestore:indexes,functions`
must run against dev / stage / prod with the same source revision. The
deploy job in CI publishes the source tag to `auditLogs/` so an operator
can correlate "what changed" with "when".
