# Release pipeline

Covers what the dev / stage / prod releases produce, where the artefacts
go, and how Crashlytics symbol upload is handled. Designed to slot in on
top of the existing `.github/workflows/ci.yml` once the production
Firebase project credentials are provisioned.

## Build matrix

| Track | Trigger | iOS destination | Android destination |
|-------|---------|-----------------|---------------------|
| dev | merge to `main` | TestFlight internal (per-build) | Play internal testing |
| stage | release branch tag `stage-vX.Y.Z` | TestFlight external | Play closed testing |
| prod | release tag `vX.Y.Z` | App Store production | Play production |

The CI pipeline at `ci.yml` only runs the test gates (`functions`,
`functions-audit`, `flutter`, `firestore-rules`, `e2e`). The release
workflow lives separately as `release.yml` (template included below) and
is enabled per-environment once these secrets are configured in
**GitHub → Settings → Environments → {dev,stage,prod} → Secrets**:

- `FIREBASE_TOKEN_<ENV>` — `firebase login:ci` token.
- `GOOGLE_SERVICES_JSON_<ENV>` — base64 of `google-services.json` for
  Android.
- `GOOGLE_SERVICE_INFO_PLIST_<ENV>` — base64 of `GoogleService-Info.plist`
  for iOS.
- `ANDROID_KEYSTORE_<ENV>`, `ANDROID_KEY_ALIAS_<ENV>`,
  `ANDROID_KEY_PASSWORD_<ENV>`, `ANDROID_STORE_PASSWORD_<ENV>` — Android
  signing material.
- `APPSTORECONNECT_API_KEY_<ENV>`, `APPSTORECONNECT_API_KEY_ID_<ENV>`,
  `APPSTORECONNECT_ISSUER_ID_<ENV>` — App Store Connect API key for
  TestFlight uploads.
- `CRASHLYTICS_API_TOKEN_<ENV>` — used by the Crashlytics CLI to upload
  symbols.

## Crashlytics symbol upload

Crashes are deobfuscated by uploading the iOS dSYM and the Android
mapping file to Firebase Crashlytics after each build. Without these
the stack traces in Crashlytics are useless.

### iOS (dSYM)

Add a build phase in Xcode (`Runner → Build Phases → New Run Script
Phase`) **after** the embed-frameworks phase, and run on every build:

```bash
"${PODS_ROOT}/FirebaseCrashlytics/upload-symbols" \
  -gsp "${SRCROOT}/Runner/GoogleService-Info.plist" \
  -p ios \
  "${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}"
```

For CI, the same script runs after `flutter build ipa`:

```bash
flutter build ipa --release \
  --dart-define=APP_ENV=$ENV
"${PODS_ROOT}/FirebaseCrashlytics/upload-symbols" \
  -gsp ios/Runner/GoogleService-Info.plist \
  -p ios \
  build/ios/archive/Runner.xcarchive/dSYMs
```

### Android (mapping.txt)

The Crashlytics Gradle plugin uploads `mapping.txt` automatically when
`firebaseCrashlytics { mappingFileUploadEnabled true }` is set in
`android/app/build.gradle`. CI does not need to do anything beyond
running `flutter build appbundle --release`.

## Release workflow template

Save this as `.github/workflows/release.yml` and uncomment the secrets
references once GitHub Environments are provisioned. It is intentionally
not enabled in this repo yet — it would fail without the secrets.

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'      # prod
      - 'stage-v*.*.*' # stage

jobs:
  android:
    runs-on: ubuntu-latest
    environment: ${{ startsWith(github.ref_name, 'stage-') && 'stage' || 'prod' }}
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.24.x'
          channel: stable
      - name: Decode google-services.json
        run: echo "${{ secrets.GOOGLE_SERVICES_JSON }}" | base64 -d > app/android/app/google-services.json
      - name: Decode keystore
        run: echo "${{ secrets.ANDROID_KEYSTORE }}" | base64 -d > app/android/app/upload-keystore.jks
      - run: flutter pub get
        working-directory: app
      - run: |
          flutter build appbundle --release \
            --dart-define=APP_ENV=${{ env.APP_ENV }}
        working-directory: app
        env:
          APP_ENV: ${{ startsWith(github.ref_name, 'stage-') && 'stage' || 'prod' }}
          ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
          ANDROID_STORE_PASSWORD: ${{ secrets.ANDROID_STORE_PASSWORD }}
      - uses: r0adkll/upload-google-play@v1
        with:
          serviceAccountJsonPlainText: ${{ secrets.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON }}
          packageName: club.supportersbus.app
          releaseFiles: app/build/app/outputs/bundle/release/app-release.aab
          track: internal

  ios:
    runs-on: macos-14
    environment: ${{ startsWith(github.ref_name, 'stage-') && 'stage' || 'prod' }}
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.24.x'
          channel: stable
      - name: Decode GoogleService-Info.plist
        run: echo "${{ secrets.GOOGLE_SERVICE_INFO_PLIST }}" | base64 -d > app/ios/Runner/GoogleService-Info.plist
      - run: flutter pub get
        working-directory: app
      - run: flutter build ipa --release --dart-define=APP_ENV=$APP_ENV
        working-directory: app
        env:
          APP_ENV: ${{ startsWith(github.ref_name, 'stage-') && 'stage' || 'prod' }}
      - name: Upload Crashlytics dSYMs
        run: |
          ./ios/Pods/FirebaseCrashlytics/upload-symbols \
            -gsp ios/Runner/GoogleService-Info.plist \
            -p ios \
            build/ios/archive/Runner.xcarchive/dSYMs
        working-directory: app
      - uses: apple-actions/upload-testflight-build@v1
        with:
          app-path: app/build/ios/ipa/*.ipa
          issuer-id: ${{ secrets.APPSTORECONNECT_ISSUER_ID }}
          api-key-id: ${{ secrets.APPSTORECONNECT_API_KEY_ID }}
          api-private-key: ${{ secrets.APPSTORECONNECT_API_KEY }}
```

## Manual checklist before a prod tag

1. `docs/production-readiness.md` shows P0 fully closed.
2. The most recent CI run on `main` is green for all five jobs.
3. Capacity scorecard SLOs from `docs/slo.md` are within budget.
4. Firestore scheduled exports are confirmed in the prod project.
5. Privileged-claim recertification (see
   `docs/runbooks/privileged-access.md`) is current within the last
   quarter.
