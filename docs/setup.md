# Setup guide

## Required tools

- Flutter stable SDK with iOS and Android tooling
- Node.js LTS with npm
- Firebase CLI
- A Firebase dev project and production project

The intended Firebase services are Authentication phone sign-in, Cloud Firestore, Firebase Cloud Messaging, Cloud Functions, Crashlytics, and later App Check.

## Repository setup

```sh
cd app
flutter pub get
flutter test
flutter run
```

```sh
cd functions
npm install
npm test
npm run build
```

```sh
cd scripts
npm install
npm run build
```

## Firebase project setup

1. Copy `.firebaserc.example` to `.firebaserc`.
2. Replace the aliases with the real Firebase project IDs.
3. Enable phone number sign-in in Firebase Authentication.
4. Create iOS and Android apps in Firebase and download platform config files into `app/` using FlutterFire CLI:

```sh
dart pub global activate flutterfire_cli
cd app
flutterfire configure --project supporters-bus-dev
```

5. Deploy rules and indexes to the dev project:

```sh
firebase use dev
firebase deploy --only firestore
```

6. Deploy Cloud Functions after dependencies are installed and tests pass:

```sh
firebase deploy --only functions
```

## Firebase emulators

Run locally from the repository root:

```sh
firebase emulators:start --only auth,firestore,functions
```

The Flutter app currently ships with a demo repository so UI flows can be reviewed before Firebase is connected. Replace the demo repository with Firestore-backed repositories once Firebase config files are committed.

## Member import

Prepare a CSV using:

```csv
firstName,lastName,displayName,primaryPhoneE164,memberNumber,generalNotes
John,Smith,John Smith,+447700900123,001,
Child,Smith,Child Smith,+447700900123,002,
```

Then run:

```sh
cd scripts
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json npm run import:members -- ../firestore/seed/members.sample.csv
```

Use a service account for the dev project first. Validate imported records before repeating against production.
