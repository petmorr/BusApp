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
| 10 | Security, Testing, and Release | Done (testing layer) — Firestore rules with role-based access + canonical link-id enforcement, 47 Firestore-rule integration tests, 30 backend unit tests, 14 end-to-end tests across the full Firebase emulator stack, App Check enforcement, centralised payload validation, structured failure handling, PII redaction in audit log, SLOs + runbooks, Dependabot + `npm audit` gate, GitHub Actions CI running five jobs. Stage / prod project provisioning + signing secrets tracked in `docs/release.md` and `docs/production-readiness.md` |

## Test inventory

Backend unit tests (`functions/test/`):

- `capacity.test.ts` — 5 tests (capacity calculation thresholds).
- `links.test.ts` — 6 tests (`memberUserLinks` id format invariants).
- `validation.test.ts` — 10 tests (callable payload validator).
- `redaction.test.ts` — 9 tests (PII redaction policy).

Firestore-rule integration tests (`firestore/tests/`, run against the
Firestore emulator):

- `memberResponses.test.ts` — 7 tests.
- `guestRequests.test.ts` — 8 tests.
- `helpers_assignment.test.ts` — 6 tests.
- `admin.test.ts` — 15 tests.
- `denyPaths.test.ts` — 11 tests (P0 deny-path coverage matrix).

End-to-end tests (`e2e/`, run against the full Auth + Firestore +
Functions emulator stack):

- `login_and_profile.test.ts` — 2 tests (signup + admin link approval +
  privacy gating; non-canonical link-id rejection).
- `response_submission.test.ts` — 3 tests (linked write triggers
  capacity recalc; unlinked write denied; cannot respond for unrelated
  member).
- `guest_decision.test.ts` — 5 tests (admin approval → audit (PII
  redacted) + notification recorded; idempotent replay; non-admin
  rejected; conflicting decisions; unknown payload field rejected).
- `helper_operational_update.test.ts` — 4 tests (assigned helper pin
  + lat/lng redaction in audit; unassigned helper denied; admin send
  operational update; out-of-range latitude rejected by validator).

Flutter app (`app/test/`):

- `widget_test.dart` — 1 test (theme builds without errors).
- `accessibility_test.dart` — 3 tests (Material tap target, labelled
  tap targets + contrast, textScaler floor).

**Totals: 30 backend unit tests + 47 Firestore-rule integration tests +
14 end-to-end tests + 4 Flutter widget tests = 95 tests.**

## Production readiness

See [`production-readiness.md`](production-readiness.md) for the per-item
P0 / P1 / P2 hardening checklist and per-area scorecard. The current
state for each P0 item is tracked there alongside the code/file links.
