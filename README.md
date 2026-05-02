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
  firestore/   # Firestore security rules, indexes, seed data
  scripts/     # Member import and admin utilities
  docs/        # Setup, runbook, spec
  firebase.json
  .firebaserc.example
```

## Stack

- Flutter / Dart for iOS and Android (single codebase).
  - Minimum supported: iOS 13+, Android 7.0 / API 24+.
- Firebase Authentication (phone OTP).
- Cloud Firestore.
- Firebase Cloud Messaging.
- Cloud Functions for Firebase (TypeScript).
- Apple Maps / Google Maps via external maps launcher.

## Getting started

See [`docs/setup.md`](docs/setup.md) for full setup instructions, and
[`docs/runbook.md`](docs/runbook.md) for the admin/operator runbook.

Quick start:

1. Install Flutter, Node 20, and the Firebase CLI.
2. `cd functions && npm install`
3. `cd app && flutter pub get`
4. Create `dev`/`prod` Firebase projects, copy `.firebaserc.example` to
   `.firebaserc` and update the project IDs.
5. Run the Firebase emulator suite: `firebase emulators:start`
6. Run the app: `cd app && flutter run`

## Status

Milestone-level completion checklist (full breakdown in
[`docs/milestones.md`](docs/milestones.md)):

| # | Milestone | Status |
|---|-----------|--------|
| 1 | Product Finalisation and Setup | **Done** — repo layout, Firebase config, CI, docs, spec PDF + summary, setup + runbook + privacy docs |
| 2 | Authentication and User Foundation | **Partial** — phone-OTP login screen, auth-aware router, role providers, FCM token registration in `NotificationsService` |
| 3 | Member and Representation Management | **Partial** — full data model + CSV import script; admin UI for member list / link approvals still TODO |
| 4 | Event and Route Management | **Partial** — data model + Firestore rules + repositories + capacity recalculation; admin event/route editor UI TODO |
| 5 | Member Attendance Flow | **Partial** — data model + repository write path + cutoff field; full attendance UI TODO |
| 6 | Guest Requests and Admin Approval | **Partial** — Cloud Function callables (`approveGuestRequest`, `rejectGuestRequest`) + repository wiring; admin UI TODO |
| 7 | Capacity, Reminders, and Notifications | **Done (backend)** — capacity helper, Firestore triggers, capacity alerts, attendance/pending-guest reminder callables, FCM fan-out; client UIs to invoke them TODO |
| 8 | Helper Operations and Parked-Bus Location | **Partial** — `updateParkedBusLocation`, `assignEventHelper`/`unassignEventHelper`, `sendOperationalUpdate` callables; helper UI screens TODO |
| 9 | Admin Attendance Board and History | **Partial** — required indexes + denormalised history fields on `memberResponses`; admin board + history screens TODO |
| 10 | Security, Testing, and Release | **Partial** — Firestore rules with role-based access + canonical link-id enforcement, **36** Firestore-rule integration tests on the emulator, **5** capacity unit tests, **6** memberUserLinks invariant unit tests, GitHub Actions CI running all of the above. App Check, Crashlytics enablement, manual device testing, and store release checklists still TODO |

Privacy posture for member directory visibility is documented in
[`docs/privacy.md`](docs/privacy.md).
