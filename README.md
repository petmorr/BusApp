# Supporters Bus Attendance App

Cross-platform Flutter and Firebase project for managing supporters bus attendance, guest seat requests, route stops, helper updates, and admin capacity controls.

This repository is structured for the MVP described in `docs/product-spec-summary.md`:

```text
app/        Flutter mobile app for iOS and Android
functions/  Firebase Cloud Functions in TypeScript
firestore/  Firestore rules, indexes, and seed data
scripts/    Member import and admin utility scripts
docs/       Architecture, setup, and runbook documentation
```

## Current status

This is the initial project scaffold. It includes:

- Flutter app foundation with large-button role-based screens.
- Shared Dart domain models and capacity calculation helpers.
- Firebase Cloud Functions TypeScript scaffold for capacity recalculation, guest decisions, reminders, operational updates, and helper assignment.
- Firestore security rules and index definitions aligned to the data model.
- CSV member import script.
- GitHub Actions workflow templates for future CI once Flutter/Node are installed in the runner.

## Local setup

Install the required tooling:

- Flutter stable SDK
- Node.js LTS and npm
- Firebase CLI

Then run:

```sh
cd app
flutter pub get
flutter run
```

For backend development:

```sh
cd functions
npm install
npm test
npm run build
```

See `docs/setup.md` for Firebase project configuration and emulator usage.
