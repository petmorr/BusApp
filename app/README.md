# supporters_bus_app

Flutter mobile app for the Supporters Bus Attendance MVP. Targets iOS 13+ and
Android 7.0 / API 24+ from a single codebase.

## Run

```bash
flutter pub get
flutterfire configure --project=supporters-bus-dev
flutter run
```

To run against the Firebase emulator suite:

```bash
flutter run --dart-define=USE_FIREBASE_EMULATOR=true \
            --dart-define=EMULATOR_HOST=localhost
```

## Layout

```
lib/
  main.dart                  # entry point
  app.dart                   # MaterialApp + router
  core/                      # cross-cutting infra (auth, routing, widgets)
  features/                  # feature folders, one per UX area
    login/
    events/
    attendance/
    guests/
    route_stops/
    helper/
    admin/
    history/
  data/
    models/                  # immutable Dart models matching Firestore schema
    repositories/            # Firestore + Cloud Functions wrappers
    firebase/                # Firebase initialisation
```

See [`../docs/setup.md`](../docs/setup.md) for full setup, and
[`../docs/spec.md`](../docs/spec.md) for the product spec summary.
