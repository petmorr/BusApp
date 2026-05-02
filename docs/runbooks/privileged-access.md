# Privileged-access runbook

Covers the lifecycle of `admin` and `helper` custom claims and the
emergency deprovisioning of a compromised account.

## Granting a new admin / helper

1. Confirm the request out-of-band (chat, signed message). Phone-only
   requests are not sufficient for `admin`.
2. Sign in as an existing admin in the production app or via the
   `setUserRole` callable in a Cloud Functions shell. Pass:

   ```json
   { "userId": "<uid>", "role": "admin" | "helper", "granted": true }
   ```

3. The callable writes an `auditLogs` entry. Verify the entry is
   present with the correct `actorUserId` and target `userId`.

## Revoking

- Same callable with `granted: false`.
- The callable revokes the custom claim on the Firebase Auth user
  *and* removes the role from `users/{uid}.roles`. The user's open
  sessions retain the old token until it expires (~1h); for emergency
  deprovisioning, force token refresh via the Firebase Auth admin SDK
  (`auth.revokeRefreshTokens(uid)`) and verify the user can no longer
  call privileged callables.

## Quarterly recertification

Every quarter (first weekday of January / April / July / October):

1. Export the list of users with `admin: true` or `helper: true` claims:

   ```bash
   firebase auth:export users.json
   jq '.users[] | select(.customClaims) | {uid, email, customClaims}' users.json
   ```

2. The committee owner reviews each entry. Anyone who no longer needs
   the role is revoked via `setUserRole(..., granted: false)`.
3. Recertification completion is recorded by writing a synthetic
   `auditLogs` entry via an admin call:
   `setUserRole({userId: "<recertifier uid>", role: "admin", granted: true})`
   (a no-op grant of an existing role still writes an audit entry that
   captures the timestamp).

## Emergency deprovisioning (compromised account)

Trigger conditions:

- A privileged user reports their phone was lost or SIM-swapped.
- An audit entry shows an action the privileged user did not perform.
- A push notification was sent that no admin authored.

Steps (target time: 15 min):

1. **Revoke claims** — `setUserRole({userId, role, granted: false})`
   for both `admin` and `helper` if present.
2. **Revoke refresh tokens** —
   `firebase auth:revoke-refresh-tokens <uid>`.
3. **Disable the user** — set `users/{uid}.isActive = false` so any
   client-side role check fails fast.
4. **Audit recent activity** — query `auditLogs` where
   `actorUserId == <uid>` and `createdAt >= now-7d`. For every
   privileged action observed, verify or undo it (via admin override
   for `memberResponses`, `rejectMemberUserLink` to undo a wrongful
   approval, etc.).
5. **Reset member-user links** — if the compromise extended to
   linking a stranger to a member, deactivate the affected
   `memberUserLinks` documents.
6. **Notify** — inform the supporters group that a compromised
   account has been deprovisioned and that no further action is
   required from members.

Postmortem: confirm the SIM-swap / lost-phone vector, evaluate whether
2FA above SMS is achievable for the privileged role.
