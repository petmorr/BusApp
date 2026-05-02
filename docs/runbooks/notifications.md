# Notification delivery degradation runbook

## Detection

- SLO alert: `notifications/{id}.status == 'failed'` rate > 5% over 1 h.
- Admin reports that members did not receive a reminder.

## Triage

1. Query `notifications` ordered by `createdAt desc` and inspect the
   most recent batch with `status` of `partial_failure` / `failed`.
2. The document includes `failureCount` and `tokenCount`. If
   `failureCount == tokenCount`, FCM rejected every token (likely an
   expired key). If `failureCount` is small, the failures are
   per-device (uninstalls, revoked notification permission).
3. Cross-reference with the affected event: confirm the recipients
   include the right users by inspecting `targetUserIds`.

## Mitigate

- For total failure (all tokens), check the Firebase Cloud Messaging
  legacy server key vs the newer HTTP v1 credentials. If the project
  rotated the key, redeploy with the updated config.
- For per-device failures, ask admins to send the reminder again
  (callable is idempotent: a re-send with the same `idempotencyKey`
  observes the existing record and is a no-op). If the original send
  did not pass an `idempotencyKey`, manually flag the failures and
  fall back to the manual contact channel for those users.
- For an event imminent in < 2h, the admin runbook
  (`docs/runbook.md`) covers manual phone / SMS fallback.

## Investigate

- Check whether the failed tokens are predominantly iOS or Android (the
  `notifications` doc does not split by platform yet, so cross-reference
  via the user's `users/{uid}/fcmTokens/*.platform`).
- For iOS, check that the APNs auth key has not expired in the Firebase
  console (Project settings → Cloud Messaging → APNs).
- For Android, check Play Services availability on devices via
  Crashlytics breadcrumbs.

## Recover

- After updating credentials or removing stale tokens, send a
  `sendOperationalUpdate` to a small synthetic recipient list to verify
  delivery before re-sending the reminder.

## Postmortem

- Number of unique users affected.
- Root cause: APNs key, FCM key, app uninstalls, OS-level revocation.
- Did `idempotencyKey` actually prevent duplicate sends on the retry?
  If not, what callable was missing one?
