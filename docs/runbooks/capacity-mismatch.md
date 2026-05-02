# Capacity mismatch runbook

## Detection

- Admin reports: "the bus is overbooked but the app does not show
  `over` status" or vice versa.
- Tier-2 SLO alert: capacity recalculation freshness lag > 5 min on a
  live event.

## Triage

1. Inspect the event document directly:

   ```text
   capacityConfirmedMemberSeats
   capacityApprovedGuestSeats
   capacityPendingGuestSeats
   capacityApprovedTotal
   capacityPotentialTotal
   capacityStatus
   pendingGuestRisk
   capacityLastCalculatedAt
   ```

2. Compute the expected totals manually from
   `events/{id}/memberResponses` and `events/{id}/guestRequests`.
3. If the totals differ, recalculation has not run since the last
   write (or has a bug).

## Mitigate

- **Force a recalculation** — perform a no-op write to `events/{id}`
  (e.g. set `capacityNearThresholdPercent` to its current value). This
  re-fires `onEventCapacityWrite` which calls
  `recalculateEventCapacity`.
- If admins disagree with the auto-calculated total because the
  underlying data is wrong (member confirmed off-app), use the admin
  override to correct the affected `memberResponses` document. The
  trigger will recalc automatically.

## Investigate

- Cloud Logging: filter for
  `labels.source="memberResponseWrite"` (or `guestRequestWrite`,
  `eventCapacityWrite`) and look for `capacity recalculation failed`
  warnings.
- Check whether the trigger silently swallowed a non-retryable error
  (logged with `retryable: false`).

## Recover

- Confirm `capacityLastCalculatedAt` advances to within seconds of the
  recovery write.
- Verify capacity status banner in the app matches the admin
  expectation.

## Postmortem

- If the trigger ran but produced a wrong total, was the bug in the
  query, the schema, or the helper math? Add a unit test in
  `functions/test/capacity.test.ts` to lock the fix.
- If the trigger did not run, was the function deployed in the right
  region / project?
