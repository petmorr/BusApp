# Milestones

The MVP build is broken into the following milestones (see `spec.pdf` for
full deliverables/acceptance criteria).

| # | Milestone | Status |
|---|-----------|--------|
| 1 | Product Finalisation and Setup | Done — repo layout, Firebase config, CI, docs (spec, setup, runbook, privacy, environments, slo, observability, runbooks, ADRs, milestones, production-readiness) |
| 2 | Authentication and User Foundation | Partial — phone-OTP login screen, role-aware router with `/admin` and `/helper` guards, FCM token registration. Per-user signup with member-link request UI TODO |
| 3 | Member and Representation Management | Partial — full data model + CSV import script. Admin member list / link approval UI TODO |
| 4 | Event and Route Management | Partial — data model + Firestore rules + repositories + capacity recalculation triggers (with retryable / permanent error classification). Admin event/route editor UI TODO |
| 5 | Member Attendance Flow | Partial — data model + repository write path + cutoff field. Full attendance UI TODO |
| 6 | Guest Requests and Admin Approval | Done (backend) — transaction-safe `approveGuestRequest` / `rejectGuestRequest` callables with idempotent notifications, structured failure handling, audit-on-failure. Admin queue UI TODO |
| 7 | Capacity, Reminders, and Notifications | Done (backend) — capacity helper, Firestore triggers, capacity alerts, attendance / pending-guest reminder callables, FCM fan-out with idempotency keys. Client UIs to invoke them TODO |
| 8 | Helper Operations and Parked-Bus Location | Partial — `updateParkedBusLocation`, helper assign/unassign, operational update callables (App Check enforced, schema validated, idempotent). Helper UI screens TODO |
| 9 | Admin Attendance Board and History | Partial — required indexes + denormalised history fields on `memberResponses`. Admin board + history screens TODO |
| 10 | Security, Testing, and Release | Mostly done — Firestore rules with role-based access + canonical link-id enforcement, 47 Firestore-rule integration tests on the emulator, 21 backend unit tests, App Check enforcement, centralised payload validation, structured failure handling, SLOs + runbooks, GitHub Actions CI running all of the above. App Check / Crashlytics enablement, device matrix testing, and store release pipelines tracked in `docs/production-readiness.md` |

## Test inventory

- `functions/test/capacity.test.ts` — 5 tests (capacity calculation thresholds).
- `functions/test/links.test.ts` — 6 tests (`memberUserLinks` id format invariants).
- `functions/test/validation.test.ts` — 10 tests (callable payload validator: required / unknown / type / length / range / enum).
- `firestore/tests/memberResponses.test.ts` — 7 tests (linked vs unlinked, spoofed responder, override flag, admin path).
- `firestore/tests/guestRequests.test.ts` — 8 tests (pending creation, status enforcement, edits, no self-approval, no third-party edits).
- `firestore/tests/helpers_assignment.test.ts` — 6 tests (assigned helper paths, unassigned helper rejections, stop deletion admin-only).
- `firestore/tests/admin.test.ts` — 15 tests (member directory privacy, canonical link-id, audit / notification write protection, event admin-only).
- `firestore/tests/denyPaths.test.ts` — 11 tests (P0 deny-path coverage matrix: unlinked response, unauthorized guest decision, helper non-allowed fields, non-admin admin collections).
- `app/test/widget_test.dart` — 1 test (theme builds without errors).

**Totals: 21 backend unit tests + 47 Firestore-rule integration tests + 1 Flutter widget test.**

## Production readiness

See [`production-readiness.md`](production-readiness.md) for the per-item
P0 / P1 / P2 hardening checklist and per-area scorecard. The current
state for each P0 item is tracked there alongside the code/file links.
