# Supporters Bus Attendance App

A cross-platform mobile app (Flutter) and Firebase backend to manage attendance
for football supporters buses travelling to matches and events.

This repository implements the MVP described in
[`docs/spec.md`](docs/spec.md) ("SPEC-1 – Supporters Bus Attendance App").

## Repository layout

```text
supporters-bus-app/
  app/         # Flutter mobile app (iOS + Android)
  functions/   # Firebase Cloud Functions (TypeScript)
  firestore/
    rules/     # Firestore security rules
    indexes/   # Firestore composite indexes
    seed/      # Sample CSV / seed data
    tests/     # Emulator integration tests for the rules
  e2e/         # End-to-end tests against the full emulator stack
  scripts/     # Member import and admin utilities
  docs/        # Spec, setup, runbook, privacy, milestones, ADRs, runbooks
  firebase.json
  .firebaserc.example
```

## Stack

- Flutter / Dart for iOS and Android (single codebase).
  - Minimum supported: iOS 13+, Android 7.0 / API 24+.
- Firebase Authentication (phone OTP).
- Cloud Firestore.
- Firebase Cloud Messaging.
- Cloud Functions for Firebase (TypeScript), with App Check enforcement on
  every callable.
- Apple Maps / Google Maps via external maps launcher.

## Getting started

See [`docs/setup.md`](docs/setup.md) for full setup instructions, and
[`docs/runbook.md`](docs/runbook.md) for the admin/operator runbook.

Quick start:

1. Install Flutter, Node 20, the Firebase CLI, and Java 17 (for the
   Firestore emulator).
2. `cd functions && npm install`
3. `cd app && flutter pub get`
4. `cd firestore/tests && npm install --legacy-peer-deps`
5. Create `dev`/`prod` Firebase projects, copy `.firebaserc.example` to
   `.firebaserc` and update the project IDs.
6. Run the Firebase emulator suite: `firebase emulators:start`
7. Run the app: `cd app && flutter run --dart-define=USE_FIREBASE_EMULATOR=true`

## Documentation

| Doc | Purpose |
|-----|---------|
| [`docs/spec.md`](docs/spec.md) | Markdown summary of SPEC-1 (PDF in `docs/spec.pdf`). |
| [`docs/setup.md`](docs/setup.md) | Local setup, Firebase project provisioning, FlutterFire. |
| [`docs/runbook.md`](docs/runbook.md) | Admin / helper operating runbook. |
| [`docs/privacy.md`](docs/privacy.md) | Privacy posture for member directory and the rest of the data model. |
| [`docs/environments.md`](docs/environments.md) | dev / stage / prod separation, IAM, deploy gates. |
| [`docs/observability.md`](docs/observability.md) | Inputs, dashboards, redaction policy, incident queries. |
| [`docs/slo.md`](docs/slo.md) | Service-level objectives and alert thresholds. |
| [`docs/runbooks/`](docs/runbooks/) | Per-failure-mode incident runbooks. |
| [`docs/adr/`](docs/adr/) | Architecture decision records. |
| [`docs/production-readiness.md`](docs/production-readiness.md) | P0 / P1 / P2 hardening checklist. |
| [`docs/release.md`](docs/release.md) | Release pipeline, Crashlytics symbol upload, signing secrets. |
| [`docs/milestones.md`](docs/milestones.md) | Milestone breakdown and test inventory. |

## Status

Milestone-level completion checklist (full breakdown in
[`docs/milestones.md`](docs/milestones.md)):

| # | Milestone | Status |
|---|-----------|--------|
| 1 | Product Finalisation and Setup | **Done** — repo layout, Firebase config, CI, docs (spec, setup, runbook, privacy, environments, slo, observability, runbooks, ADRs, milestones, production-readiness) |
| 2 | Authentication and User Foundation | **Partial** — phone-OTP login screen, role-aware router with `/admin` and `/helper` guards, FCM token registration |
| 3 | Member and Representation Management | **Partial** — full data model + CSV import script; admin UI TODO |
| 4 | Event and Route Management | **Partial** — data model + Firestore rules + repositories + capacity recalculation; admin event/route editor UI TODO |
| 5 | Member Attendance Flow | **Partial** — data model + repository write path + cutoff field; full attendance UI TODO |
| 6 | Guest Requests and Admin Approval | **Done (backend)** — transaction-safe `approveGuestRequest` / `rejectGuestRequest` callables with idempotent notifications and structured failure handling; admin UI TODO |
| 7 | Capacity, Reminders, and Notifications | **Done (backend)** — capacity helper, Firestore triggers with retryable/permanent error classification, capacity alerts, attendance / pending-guest reminder callables, FCM fan-out with idempotency keys; client UI TODO |
| 8 | Helper Operations and Parked-Bus Location | **Partial** — `updateParkedBusLocation`, helper assign/unassign, operational update callables; helper UI screens TODO |
| 9 | Admin Attendance Board and History | **Partial** — required indexes + denormalised history fields on `memberResponses`; admin board + history screens TODO |
| 10 | Security, Testing, and Release | **Done (testing layer)** — privacy-hardened Firestore rules with canonical link-id enforcement; **47** Firestore-rule integration tests; **30** backend unit tests; **14** end-to-end tests against the full emulator stack; App Check enforcement; centralised payload validation; structured failure handling with PII redaction; SLOs + runbooks; Dependabot + `npm audit` gate; CI runs all of the above. Stage / prod project provisioning + signing secrets remain — see `docs/release.md`. |

For the per-item production-readiness state and per-area scorecard see
[`docs/production-readiness.md`](docs/production-readiness.md).
