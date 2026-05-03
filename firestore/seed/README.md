# Seed data

This directory holds seed/example data for local emulator runs.

- `members.example.csv` — example bulk import (also used by `scripts/`).
- `seed.sample.json` — sample Firestore documents to import via the emulator.

To load into the local emulator after `firebase emulators:start`:

```bash
cd scripts
npm install
FIRESTORE_EMULATOR_HOST=localhost:8080 \
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
GCLOUD_PROJECT=demo-supporters-bus \
  npm run seed-emulator
```

The script writes the `members` + `events` + `events/{id}/stops` documents
defined in `seed.sample.json`, and creates a demo admin user with phone
`+15555550100` and the `admin: true` custom claim so you can sign in to the
app and exercise admin flows immediately.
