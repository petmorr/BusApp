# Service-level objectives

Targets for the production environment. Each SLO has an owner, an alert
threshold, and a linked runbook.

## Tier-1 SLOs (alert → page)

| SLO | Target (rolling 28 days) | Alert threshold | Runbook |
|-----|--------------------------|-----------------|---------|
| Phone-OTP login success rate | ≥ 99.0% | < 97.0% over 30 min | [`runbooks/auth-outage.md`](runbooks/auth-outage.md) |
| Callable error rate (5xx + permission-denied not from rules) | ≤ 1.0% | > 3.0% over 30 min | [`runbooks/callable-errors.md`](runbooks/callable-errors.md) |
| Push delivery — `failed` notifications | ≤ 1.0% of sends | > 5.0% over 1 h | [`runbooks/notifications.md`](runbooks/notifications.md) |
| Firestore permission-denied (logged-in users) | ≤ 0.5% of reads/writes | > 2.0% over 30 min | [`runbooks/firestore-perm-misconfig.md`](runbooks/firestore-perm-misconfig.md) |

## Tier-2 SLOs (alert → ticket)

| SLO | Target | Alert threshold |
|-----|--------|-----------------|
| Callable p95 latency | ≤ 1500 ms | > 3000 ms over 1 h |
| Capacity recalculation freshness | within 60 s of input change | `capacityLastCalculatedAt` lag > 5 min |
| App crash-free users (28-day) | ≥ 99.5% | drop > 0.5 pp week-on-week |

## Capacity SLO

| Metric | Target | Notes |
|--------|--------|-------|
| Number of admin capacity overrides per event | ≤ 1 | If repeated, the bus capacity field or guest approval workflow may be misconfigured. |
| Number of `capacity_alert` notifications per event | ≤ 3 | Flapping suggests `capacityNearThresholdPercent` is too aggressive. |

## Error budget

Tier-1 SLOs imply a monthly error budget of ~7h (1% of a 28-day window).
When the budget is exhausted, feature deploys to production pause until
the budget recovers. Hotfixes are always allowed.

## Reviewing the SLOs

The SLOs are reviewed after the first 5 live events using the
post-launch metrics from [`docs/spec.md`](spec.md). Adjustments require
a PR that updates this file and links to the data behind the change.
