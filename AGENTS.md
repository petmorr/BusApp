# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Supporters Bus Attendance App — Flutter mobile app + Firebase backend (Cloud Functions in TypeScript, Firestore, Auth). See `README.md` and `docs/setup.md` for full docs.

### System dependencies

- **Node.js 20** via nvm (loaded from `~/.bashrc`)
- **Flutter 3.24.x** at `/opt/flutter/bin` (on PATH via `~/.bashrc`)
- **Java 17+** (pre-installed; required by Firestore emulator)
- **Firebase CLI** installed globally via npm (`firebase-tools`)

### Project structure with separate npm packages

Each of these directories has its own `package.json` and `package-lock.json`:

| Directory | Purpose | Install command |
|-----------|---------|----------------|
| `functions/` | Cloud Functions backend | `npm install` |
| `firestore/tests/` | Firestore security rule tests | `npm install --legacy-peer-deps` |
| `e2e/` | End-to-end emulator tests | `npm install --legacy-peer-deps` |
| `scripts/` | Admin/import utilities | `npm install` |
| `app/` | Flutter mobile app | `flutter pub get` |

The `--legacy-peer-deps` flag is required for `firestore/tests/` and `e2e/` due to peer dependency conflicts in `@firebase/rules-unit-testing`.

### Build

Cloud Functions must be compiled before emulators or E2E tests can run:
```
cd functions && npm run build
```

### Running tests

All four test suites match what CI runs (`.github/workflows/ci.yml`):

| Suite | Command | Notes |
|-------|---------|-------|
| Functions unit tests (50) | `cd functions && npm test` | Pure unit tests, no emulators needed |
| Firestore rule tests (65) | `cd firestore/tests && npm test` | Launches its own Firestore emulator via `firebase emulators:exec` |
| E2E tests (20) | `cd e2e && npm test` | Builds functions first, launches auth+firestore+functions emulators |
| Flutter tests (9) | `cd app && flutter test` | Widget/accessibility tests |

### Lint

- `cd functions && npm run lint` (ESLint)
- `cd app && flutter analyze`

### Running emulators interactively

```
cp .firebaserc.example .firebaserc   # only needed once
firebase emulators:start
```

Emulator UI at http://127.0.0.1:4000. Ports: Auth 9099, Firestore 8080, Functions 5001.

### Gotchas

- `.firebaserc` is gitignored. Copy from `.firebaserc.example` for local/emulator use.
- The E2E test script (`e2e/package.json` → `npm test`) automatically builds functions before running, so you don't need a separate build step.
- Firestore rule tests and E2E tests each start their own emulator instances via `firebase emulators:exec`; they don't need a separately running emulator.
- The Flutter app is not runnable in a headless Cloud Agent VM (no iOS/Android simulator). Flutter analyze and widget tests work fine.
