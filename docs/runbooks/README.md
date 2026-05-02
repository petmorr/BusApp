# Runbooks

One file per failure mode. Each runbook follows the same structure:

1. **Detection** — which alert / dashboard widget / user report triggers
   this runbook.
2. **Triage** — first-five-minutes checks: confirm the symptom, scope
   the blast radius, decide on severity.
3. **Mitigate** — short-term actions to stop user impact (failover,
   feature flag off, manual override).
4. **Investigate** — diagnose root cause once user impact is mitigated.
5. **Recover** — return to normal operation; verify with a synthetic
   request.
6. **Postmortem** — what to capture in the incident write-up.

Indexed runbooks:

- [`auth-outage.md`](auth-outage.md)
- [`callable-errors.md`](callable-errors.md)
- [`notifications.md`](notifications.md)
- [`firestore-perm-misconfig.md`](firestore-perm-misconfig.md)
- [`capacity-mismatch.md`](capacity-mismatch.md)
- [`privileged-access.md`](privileged-access.md)
