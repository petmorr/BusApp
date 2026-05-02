# ADR 0002 — Callable Cloud Function hardening defaults

- **Status**: accepted
- **Date**: 2026-05-02

## Context

The project exposes ~10 callable Cloud Functions for privileged actions
(guest approval, attendance/operational notifications, parked-bus
location, helper assignment, link approval, role grants). The original
scaffold accepted any JSON payload, ran without App Check enforcement,
sent FCM directly without dedupe, and updated state in a non-transactional
read-then-write pattern. None of those are acceptable defaults for a
production deployment.

## Decision

All callables share the following defaults via
`functions/src/utils/options.ts#callableDefaults` and the helpers in
`functions/src/utils/{validation,idempotency,errors,notifications}.ts`:

1. **App Check enforcement** — `enforceAppCheck: true` and
   `consumeAppCheckToken: true`. The emulator does not mint App Check
   tokens, so the defaults respect a `BYPASS_APP_CHECK=true` env var that
   integration tests can opt into. Production deploys never set it.
2. **Centralised input validation** — every callable declares a
   `Schema` (string / number / boolean / enum / optional / min / max /
   length bounds) and uses `validate(req.data, schema)` as its first
   line. Unknown fields are rejected so a malicious client cannot
   smuggle privileged fields past the contract.
3. **Transaction-safe state mutation** — guest approval / rejection,
   `setUserRole`, and `approveMemberUserLink` perform their
   precondition check + state write inside a Firestore transaction so
   two concurrent admins cannot both flip a `pending` decision and
   overwrite each other's audit trail.
4. **Idempotency for side effects** —
   `notifications.sendNotificationToUsers` accepts an
   `idempotencyKey`. When set, the notifications/{id} document id is
   deterministic and a re-invocation with the same key short-circuits
   without re-dispatching FCM. Guest approval / rejection compose the
   key as `guest-decision:{path}:{status}` so a retried decision does
   not double-notify the requester. Generic callables can also accept a
   client-supplied `idempotencyKey` that flows into a per-call
   `withIdempotency(...)` wrap (`functions/src/utils/idempotency.ts`).
5. **Server-side timestamps** — every authoritative timestamp
   (`createdAt`, `updatedAt`, `decisionAt`, `approvedAt`,
   `lastCapacityAlertSentAt`, `parkedBusLocation.updatedAt`,
   `notification.sentAt`) is `FieldValue.serverTimestamp()`, never a
   client clock value.
6. **Structured failure handling** — `functions/src/utils/errors.ts#classify`
   maps `HttpsError` codes to retryable / non-retryable, and
   `reportFailure(...)` writes a `${action}__failed` audit log entry
   *before* re-throwing. Triggers swallow non-retryable errors and
   re-throw retryable ones so the platform retries the trigger
   automatically.

## Consequences

- **Positive** — every callable now has a stable contract, a single
  failure-reporting path, and a documented retry policy.
- **Positive** — accidental double clicks, retries, and FCM platform
  retries no longer produce duplicate pushes (when the caller supplies
  an idempotency key).
- **Negative** — the emulator cannot mint App Check tokens, so the
  function test environment must set `BYPASS_APP_CHECK=true`. Documented
  in `functions/src/utils/options.ts` and `docs/setup.md`.
- **Negative** — `idempotencyKeys/{id}` documents accumulate. A periodic
  cleanup task is tracked as follow-up; the records have a defaulted
  24-hour TTL semantic but are not auto-deleted yet.
- **Follow-up** — periodic cleanup of `idempotencyKeys/`. Add a
  Cloud Scheduler-triggered function once the production project is
  configured.

## Alternatives considered

- **Per-callable bespoke validation** — what we had. Worked, but every
  new callable copy-pasted the same checks slightly differently and the
  contract drifted from documentation.
- **Schema library (zod, yup)** — overkill for ~10 callables and adds a
  bundled dependency to every function deploy. The 80-line validator in
  `validation.ts` covers our needs and stays inspectable.
- **Append-only event log instead of idempotency keys** — heavier for
  the MVP. Idempotency keys per callable are simpler to reason about
  and adequate for our current invocation rate.

## References

- `functions/src/utils/options.ts`
- `functions/src/utils/validation.ts`
- `functions/src/utils/idempotency.ts`
- `functions/src/utils/errors.ts`
- `functions/src/callables/*.ts`
