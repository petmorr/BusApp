# Observability

What we capture, where it lives, and how to query it during an incident.

## Inputs

| Source | What it captures |
|--------|------------------|
| Cloud Functions logs (Cloud Logging) | Structured `logger.info / warn / error` entries from every callable and trigger. Always include `action`, `entityPath`, `actorUserId`, and (for failures) `classification`, `code`, `retryable`. |
| `auditLogs/{id}` | Every successful admin / helper action plus `${action}__failed` entries from `reportFailure()`. Sorted by `createdAt`. |
| `notifications/{id}` | Per-push delivery record. `status` is one of `queued` / `sent` / `partial_failure` / `failed`; `failureCount` and `tokenCount` capture FCM totals for partial failures. |
| Firebase Crashlytics | Mobile app crashes. Symbol upload runs in CI so stack traces are deobfuscated. |
| Firebase App Check metrics | Reject rate per callable. A spike points at either an SDK regression or scripted abuse. |
| Firebase Auth audit | Phone-OTP request rate and failure rate. |

## Dashboards

A single Cloud Monitoring dashboard called `Supporters Bus — overview`
should be created in the prod project containing:

- callable invocations and 5xx rate per function,
- p50 / p95 callable latency,
- Firestore-trigger error rate,
- FCM `partial_failure` + `failed` counts (from a log-based metric over
  `notifications/{id}.status`),
- crash-free users (Crashlytics) trend over the last 14 days,
- App Check reject rate per platform.

## Alerting

See [`docs/slo.md`](slo.md) for the SLOs that drive each alert. Every
alert routes to PagerDuty (or e-mail for the MVP if PagerDuty is not yet
provisioned), with a link to the relevant runbook in
`docs/runbooks/`.

## Querying during an incident

Useful starting points:

- **"Did the last guest approval push go out?"**
  Query `notifications` where `eventId == X` and `type ==
  guest_approved`, ordered by `createdAt desc`.

- **"What did admin X do in the last hour?"**
  Query `auditLogs` where `actorUserId == X` and `createdAt >= now-1h`.

- **"Why did `sendOperationalUpdate` fail for event X?"**
  Cloud Logging filter:
  `resource.type="cloud_function"
   labels.action="send_operational_update"
   jsonPayload.entityPath="events/X"
   severity>=ERROR`.

- **"Did capacity recalculation fall behind?"**
  Query `events` where `capacityLastCalculatedAt < eventDate -
  1h`. Re-trigger via a no-op write to `events/{id}`.

## Log redaction

Cloud Functions logs include `entityPath` and `actorUserId` but never
phone numbers, member display names, or guest names. The audit log
entries store the `before` / `after` shapes of the changed document for
operator review; these documents already follow the data-minimisation
posture in `docs/privacy.md` (no email, no payment data, no live
location). When a future change introduces a sensitive field, the
`reportFailure` extras and audit `before` / `after` payloads should be
filtered to drop it before logging.
