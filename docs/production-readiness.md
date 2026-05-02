# Production-readiness checklist

Tracks P0 / P1 / P2 hardening items against the production readiness
review. P0 must be **Done** before the first prod deploy.

## P0 — must complete before production launch

### Security and authorization

- [x] Tighten `members` read policy to linked-user scope.
      ([`firestore/rules/firestore.rules`](../firestore/rules/firestore.rules),
      [`docs/privacy.md`](privacy.md))
- [x] Enforce `memberUserLinks` ID invariant in every writer path.
      Rule layer + `approveMemberUserLink` callable +
      `MemberUserLink.idFor` + `memberUserLinkId(...)`.
      ([ADR 0001](adr/0001-canonical-member-user-link-id.md))
- [x] Emulator tests for all critical deny paths
      ([`firestore/tests/denyPaths.test.ts`](../firestore/tests/denyPaths.test.ts)
      plus the per-collection suites — 47 tests total).
- [x] Enforce App Check on callable endpoints (default in
      [`functions/src/utils/options.ts`](../functions/src/utils/options.ts);
      bypassable only via `BYPASS_APP_CHECK=true` in test env).
- [x] Centralized payload schema validation for all callables — rejects
      missing required, type mismatches, and *unknown* fields.
      ([`functions/src/utils/validation.ts`](../functions/src/utils/validation.ts),
      [unit tests](../functions/test/validation.test.ts))

### Backend correctness and reliability

- [x] Guest decision path is transaction-safe (single Firestore
      transaction reads + asserts pending + writes the decision and
      decision metadata).
      ([`functions/src/callables/guestApproval.ts`](../functions/src/callables/guestApproval.ts))
- [x] Notification idempotency keys for callables that produce side
      effects. Repeated calls with the same key observe the existing
      `notifications/{id}` and skip FCM dispatch.
      ([`functions/src/utils/notifications.ts`](../functions/src/utils/notifications.ts))
- [x] Generic `withIdempotency()` wrapper for callables (used by guest
      approval/rejection).
      ([`functions/src/utils/idempotency.ts`](../functions/src/utils/idempotency.ts))
- [x] Explicit partial-failure policy for `update -> audit -> notify`:
      `reportFailure(...)` writes a `${action}__failed` audit entry,
      `classify(err)` decides retryable vs permanent, triggers re-throw
      retryable errors so the platform retries.
      ([`functions/src/utils/errors.ts`](../functions/src/utils/errors.ts))
- [x] Server-time policy: every authoritative timestamp uses
      `FieldValue.serverTimestamp()` (createdAt / updatedAt / decisionAt
      / approvedAt / lastCapacityAlertSentAt / parkedBusLocation.updatedAt
      / notifications.sentAt). Documented in
      [ADR 0002](adr/0002-callable-hardening.md).

### Testing and release gates

- [x] CI checks on every PR:
      [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs
      `npm run build && npm test` for Cloud Functions, `flutter
      analyze && flutter test` for the app, and
      `firebase emulators:exec ... jest` for Firestore rules.
- [ ] End-to-end integration tests for: login + profile creation,
      response submission, guest request decision, helper operational
      update. Tracked as the next milestone PR — the building blocks
      (callable schema, deterministic notification ids, deny-path
      coverage) are now in place.

### Operational readiness

- [x] Baseline SLOs documented with alert thresholds and runbook links
      ([`docs/slo.md`](slo.md)).
- [x] Incident runbooks for auth outage, callable errors, notification
      degradation, Firestore permission misconfig, capacity mismatch,
      privileged-access lifecycle ([`docs/runbooks/`](runbooks/)).
- [x] Environment separation (dev/stage/prod) with distinct IAM and
      protected deploy rules ([`docs/environments.md`](environments.md)).

## P1 — launch-critical hardening

### Performance and scalability

- [x] Firestore index coverage for repository queries
      ([`firestore/indexes/firestore.indexes.json`](../firestore/indexes/firestore.indexes.json));
      reviewed against every `where` / `orderBy` clause in
      `app/lib/data/repositories/*` and `functions/src/callables/*`.
- [ ] Load / perf tests for capacity triggers and notification fan-out.
      Pending the move to the stage project.
- [ ] Profile `watchLinkedMembers` once any user represents > 5 members.
      Currently OK at the documented MVP scale (≈60 members, typical
      fan-out 1–3).

### Mobile app quality

- [x] Role-aware route guards for `/admin` and `/helper`
      ([`app/lib/core/routing/app_router.dart`](../app/lib/core/routing/app_router.dart)).
- [ ] Offline / retry UX for write actions with deterministic conflict
      messaging.
- [ ] Crashlytics + release-symbol upload automation.
- [ ] Accessibility baseline checks (dynamic type, semantic labels,
      contrast).

### Security operations

- [x] Privileged-claim recertification process and emergency
      deprovision runbook
      ([`docs/runbooks/privileged-access.md`](runbooks/privileged-access.md)).
- [ ] Dependency vulnerability automation (Dependabot / npm audit
      threshold).
- [x] Log redaction policy
      ([`docs/observability.md`](observability.md), "Log redaction").

## P2 — scale and maturity

- [x] ADR template ([`docs/adr/0000-adr-template.md`](adr/0000-adr-template.md))
      with two initial entries (canonical link id, callable hardening).
- [ ] Synthetic monitoring for top user journeys.
- [ ] Data retention / archival automation.
- [ ] Lightweight control mapping (SOC2-style matrix).

---

Per-area scorecard after this PR (production target in parentheses):

- Security architecture: **8.5/10** (10/10).
- Backend correctness: **8/10** (10/10).
- Performance readiness: **6.5/10** (10/10).
- Testing maturity: **7/10** (10/10).
- Operability / SRE: **7/10** (10/10).
- Release governance: **6.5/10** (10/10).
