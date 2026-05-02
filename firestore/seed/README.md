# Seed data

This directory holds seed/example data for local emulator runs.

- `members.example.csv` — example bulk import (also used by `scripts/`).
- `seed.sample.json` — sample Firestore documents to import via the emulator.

To load into the local emulator after `firebase emulators:start`:

```bash
firebase emulators:exec --only firestore "node ../scripts/seed-emulator.js"
```

(Implementation TODO — script is not yet provided in the scaffold.)
