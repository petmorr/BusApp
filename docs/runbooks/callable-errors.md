# Callable error rate runbook

## Detection

- SLO alert: callable error rate > 3% over 30 min.
- Spike in the **callable invocations / 5xx rate** widget on the
  observability dashboard.

## Triage

1. Identify the affected callable(s) from the Cloud Functions metrics.
2. Open Cloud Logging filtered to that function:
   `resource.type="cloud_function"
    resource.labels.function_name="<name>"
    severity>=ERROR`.
3. Inspect the top error class. The structured logs include
   `classification` (one of `invalid` / `permission` / `not_found` /
   `conflict` / `transient` / `permanent`) and `code` from `HttpsError`.

## Mitigate

- For `invalid-argument` spikes — almost always a recently shipped
  client. Confirm via the app version distribution in Firebase. If a bad
  release is the cause, hide it from new installs in App Store Connect /
  Play Console and roll forward with a fixed build. Server stays up.
- For `permission-denied` spikes — likely a Firestore rules or custom
  claims regression. Cross-check with the rules-misconfig runbook.
- For `internal` / `transient` spikes — almost always upstream
  Firestore. Confirm on the status page; the platform retries triggers
  automatically. Surface a "we're investigating" note via the admin
  contact channel only if the spike sustains > 30 min.

## Investigate

- Pull the matching `auditLogs/${action}__failed` entries — these
  capture the failure classification at write time and survive even
  when log retention has rolled over.
- For App Check rejects, check `enforceAppCheck` and
  `consumeAppCheckToken` were not flipped off accidentally.

## Recover

- Re-deploy the previous functions revision via
  `firebase deploy --only functions`. CI ships the deploy artefact
  hash to `auditLogs` so the previous artefact is identifiable.
- Verify with a synthetic call from a dev-project test client.

## Postmortem

- Severity (S1 / S2 / S3).
- User impact: number of failed callables × distinct users.
- Root cause: client / rules / claims / infra / our code.
- Did the structured logs make diagnosis easy? If not, what extra
  context should be added to `reportFailure(...)`?
