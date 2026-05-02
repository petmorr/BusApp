# Milestones

The MVP build is broken into the following milestones (see `spec.pdf` for
full deliverables/acceptance criteria).

| # | Milestone | Status |
|---|-----------|--------|
| 1 | Product Finalisation and Setup | Done — repo layout, Firebase config, CI, docs (spec, setup, runbook, privacy, milestones) |
| 2 | Authentication and User Foundation | Partial — phone-OTP login screen, auth-aware router, role providers, FCM token registration. Per-user signup flow with member-link request UI TODO |
| 3 | Member and Representation Management | Partial — full data model + CSV import script. Admin member list / link approval UI TODO |
| 4 | Event and Route Management | Partial — data model + Firestore rules + repositories + capacity recalculation triggers. Admin event/route editor UI TODO |
| 5 | Member Attendance Flow | Partial — data model + repository write path + cutoff field. Full attendance UI TODO |
| 6 | Guest Requests and Admin Approval | Partial — Cloud Function callables and repository wiring. Admin guest queue UI TODO |
| 7 | Capacity, Reminders, and Notifications | Done (backend) — capacity helper, Firestore triggers, capacity alerts, attendance/pending-guest reminder callables, FCM fan-out. Client UIs to invoke them TODO |
| 8 | Helper Operations and Parked-Bus Location | Partial — `updateParkedBusLocation`, helper assign/unassign, operational update callables. Helper UI screens TODO |
| 9 | Admin Attendance Board and History | Partial — required indexes + denormalised history fields on `memberResponses`. Admin board + history screens TODO |
| 10 | Security, Testing, and Release | Partial — Firestore rules with role-based access + canonical link-id enforcement; **36** Firestore-rule integration tests on the emulator; **5** capacity unit tests; **6** memberUserLinks invariant unit tests; GitHub Actions CI running all of the above. App Check, Crashlytics enablement, device matrix testing, and store release checklists TODO |

This scaffold is the foundation for subsequent feature work. Each milestone
above can be tackled in its own PR. Tests added so far:

- `functions/test/capacity.test.ts` — capacity calculation thresholds.
- `functions/test/links.test.ts` — `memberUserLinks` id format invariants.
- `firestore/tests/*.test.ts` — emulator integration tests for Firestore
  rules (member responses, guest requests, helper assignment, admin-only
  operations and member directory privacy).
