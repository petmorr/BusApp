# Auth outage runbook

## Detection

- SLO alert: phone-OTP login success rate < 97% over 30 min.
- User reports of "I never received the SMS code" via the admin contact
  channel.
- Firebase status page shows degradation in **Authentication** or **SMS
  delivery**.

## Triage

1. Open the Firebase status page (https://status.firebase.google.com/).
   If Auth or SMS provider is degraded, this is upstream — skip to
   "Mitigate" and monitor.
2. Check Cloud Logging for `firebase_auth` errors over the alert
   window:
   `resource.type="firebase_auth" severity>=ERROR`.
3. Confirm that the App Check enforcement on `requestVerificationCode`
   is not the cause (a recent App Check key rotation can cause a sudden
   drop). Check the App Check reject rate dashboard.

## Mitigate

- If the cause is upstream, switch the in-app login screen messaging to
  point users at the admin contact channel for manual attendance entry
  (see `docs/runbook.md`). Admins can record attendance on behalf of
  members.
- If the cause is App Check key rotation, roll back the rotation in the
  Firebase console and re-deploy the previous app build.
- If a single helper / admin reports a personal failure, ask them to
  re-install the app (token cache may be stale). Do not roll back the
  whole deployment for one user.

## Investigate

- Cloud Logging by phone number prefix can show whether the failure is
  geographic.
- Confirm the iOS / Android Firebase Auth SDK versions used by the
  failing devices via Crashlytics breadcrumbs.
- For sustained SMS provider outages, document in the postmortem and
  open a ticket to evaluate adding a secondary SMS provider (out of
  scope for the MVP).

## Recover

- Once the upstream issue is resolved, sign-in success rate should
  recover within minutes. Verify by triggering a synthetic OTP request
  with a test phone number registered in the dev project.

## Postmortem

- Severity (S1 / S2 / S3).
- User impact: estimated number of failed logins.
- Root cause: upstream / SDK / App Check / our config.
- Action items.
