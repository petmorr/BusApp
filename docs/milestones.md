# Milestones

The MVP build is broken into the following milestones (see `spec.pdf` for
full deliverables/acceptance criteria).

| # | Milestone | Status |
|---|-----------|--------|
| 1 | Product Finalisation and Setup | Done — repo layout, Firebase config, CI, docs (spec, setup, runbook, privacy, environments, slo, observability, runbooks, ADRs, milestones, production-readiness) |
| 2 | Authentication and User Foundation | Done — phone-OTP login screen, role-aware router with `/admin` and `/helper` guards, FCM token registration, post-sign-in profile bootstrap, signup screen with `requestMemberLinkByNumber` callable for privacy-preserving member-link requests |
| 3 | Member and Representation Management | Done — full data model + CSV import script + admin members list (search, create, edit, delete, status changes) + admin pending-link queue with approve/reject |
| 4 | Event and Route Management | Done — data model + Firestore rules + repositories + capacity recalculation triggers + admin event CRUD (details, status, capacity, cutoff), stop CRUD across the four stop types, helper assignment toggles, push reminder controls |
| 5 | Member Attendance Flow | Done — data model + repository write path + cutoff field + attendance form with member picker, attending toggle, pickup-stop chooser, optional return drop-off, free-text notes, cutoff enforcement |
| 6 | Guest Requests and Admin Approval | Done — transaction-safe `approveGuestRequest` / `rejectGuestRequest` callables with idempotent notifications, structured failure handling, audit-on-failure + user-facing guest request form + admin pending-guest queue (collection-group query) with approve/reject |
| 7 | Capacity, Reminders, and Notifications | Done — capacity helper, Firestore triggers, capacity alerts, attendance / pending-guest reminder callables, FCM fan-out with idempotency keys + admin reminders tab to invoke them, plus operational-update form |
| 8 | Helper Operations and Parked-Bus Location | Done — `updateParkedBusLocation`, helper assign/unassign, operational update callables (App Check enforced, schema validated, idempotent) + helper UI: assigned-events list (collection-group query), parked-bus pin form (use-my-location + manual coordinates), operational update form |
| 9 | Admin Attendance Board and History | Done — required indexes + denormalised history fields on `memberResponses` + per-event attendance board (capacity totals, attending grouped by stop, not-attending list, guest groupings) + cross-event history with member/event search |
| 10 | Security, Testing, and Release | Done (testing layer) — Firestore rules with role-based access + canonical link-id enforcement, **65** Firestore-rule integration tests, **50** backend unit tests, **20** end-to-end tests across the full Firebase emulator stack, **9** Flutter widget tests, App Check enforcement (with project-id allow-listed bypass for emulators), centralised payload validation, structured failure handling, PII redaction in audit log, per-uid rate limiting on user-facing lookup callables, SLOs + runbooks, Dependabot + `npm audit` gate, GitHub Actions CI running five jobs. Stage / prod project provisioning + signing secrets tracked in `docs/release.md` and `docs/production-readiness.md` |

## Test inventory

Backend unit tests (`functions/test/`):

- `capacity.test.ts` — 5 tests (capacity calculation thresholds).
- `links.test.ts` — 6 tests (`memberUserLinks` id format invariants).
- `validation.test.ts` — 10 tests (callable payload validator).
- `redaction.test.ts` — 9 tests (PII redaction policy).
- `errors.test.ts` — 9 tests (error classification matrix + audit-log
  redaction policy for non-`HttpsError` messages).
- `options.test.ts` — 7 tests (App Check bypass is gated on a
  project-id allow-list; env var alone is not enough).
- `rateLimit.test.ts` — 4 tests (per-key fixed-window counter,
  resource-exhausted on overflow, window reset, per-key isolation).

Firestore-rule integration tests (`firestore/tests/`, run against the
Firestore emulator):

- `memberResponses.test.ts` — 7 tests.
- `guestRequests.test.ts` — 8 tests.
- `helpers_assignment.test.ts` — 8 tests (incl. collection-group read
  coverage for the helper-events query).
- `admin.test.ts` — 15 tests.
- `denyPaths.test.ts` — 11 tests (P0 deny-path coverage matrix).
- `hardening.test.ts` — 16 tests (active-link requirement for member
  + response reads, helper stop-field allow-list, `rateLimits` and
  `idempotencyKeys` client lockdown).

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
- `request_member_link_by_number.test.ts` — 6 tests (creates pending
  self-link; unknown + inactive return the same generic response;
  idempotent replay on already-active; sticky rejection is preserved;
  every invocation writes an outcome-tagged audit log).

Flutter app (`app/test/`):

- `widget_test.dart` — 1 test (theme builds without errors).
- `accessibility_test.dart` — 3 tests (Material tap target, labelled
  tap targets + contrast, textScaler floor).
- `ui_patterns_accessibility_test.dart` — 5 tests (form labels +
  contrast, SegmentedButton tap target + labelling, SwitchListTile
  labelling + tap target, FilledButton/OutlinedButton row tap targets,
  admin/helper menu Card → ListTile titles).

**Totals: 50 backend unit tests + 65 Firestore-rule integration tests +
20 end-to-end tests + 9 Flutter widget tests = 144 tests.**

## Production readiness

See [`production-readiness.md`](production-readiness.md) for the per-item
P0 / P1 / P2 hardening checklist and per-area scorecard. The current
state for each P0 item is tracked there alongside the code/file links.
