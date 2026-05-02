# Setup

## Prerequisites

- [Flutter 3.x](https://docs.flutter.dev/get-started/install) with Android &
  iOS toolchains.
- [Node.js 20](https://nodejs.org/) and npm.
- [Firebase CLI](https://firebase.google.com/docs/cli):
  `npm install -g firebase-tools`
- [FlutterFire CLI](https://firebase.flutter.dev/docs/cli/):
  `dart pub global activate flutterfire_cli`
- Java 17 for Android builds, Xcode 15+ for iOS builds.

## Firebase projects

Create two Firebase projects in the Firebase console:

- `supporters-bus-dev` — used for development, internal testing, and
  TestFlight / Play internal testing.
- `supporters-bus-prod` — used for production releases.

Enable the following services on both projects:

- Authentication → **Phone** sign-in method.
- Cloud Firestore (Native mode).
- Firebase Cloud Messaging.
- Cloud Functions.
- Crashlytics.
- App Check (turn on after the first MVP test build is stable).

Then:

```bash
cp .firebaserc.example .firebaserc
firebase login
firebase use dev
```

## Cloud Functions

```bash
cd functions
npm install
npm run build
```

Deploy:

```bash
firebase deploy --only functions
```

## Firestore rules and indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## Flutter app

```bash
cd app
flutter pub get
flutterfire configure --project=supporters-bus-dev
flutter run
```

`flutterfire configure` writes `app/lib/firebase_options.dart` and the
platform-specific `GoogleService-Info.plist` / `google-services.json` files.
These platform files are gitignored — each developer or CI environment must
generate them with `flutterfire configure`.

### Android-specific setup

- `minSdkVersion` must be `24` (Android 7.0).
- Configure SHA-1 / SHA-256 in the Firebase project settings to enable phone
  auth.

### iOS-specific setup

- Deployment target `13.0`.
- Add APNs key to Firebase project for push notifications.
- Enable the **Push Notifications** and **Background Modes → Remote
  notifications** capabilities in Xcode.

## Local emulator development

The repo's `firebase.json` configures the Auth, Firestore, Functions and
Emulator UI. Start it with:

```bash
firebase emulators:start
```

The Flutter app can be wired to the emulator suite by setting `--dart-define
USE_FIREBASE_EMULATOR=true` when running.

## Member import

Bulk-load the initial member list with:

```bash
cd scripts
npm install
npm run import-members -- --csv ./members.example.csv --project supporters-bus-dev
```

See [`scripts/README.md`](../scripts/README.md) for details.
