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

This is an initial scaffold. Each milestone in `docs/spec.md` builds on this
foundation:

- Project skeleton, security rules, indexes, capacity logic, and notification
  callables are scaffolded.
- Flutter feature folders contain placeholder screens and shared models that
  match the Firestore schema.
- A CSV-driven member import script is provided under `scripts/`.

See [`docs/milestones.md`](docs/milestones.md) for the milestone breakdown.
