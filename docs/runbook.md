# Admin / Operator runbook

This runbook covers day-to-day operation of the Supporters Bus Attendance
App. It is aimed at admins (committee members) and helpers (matchday
volunteers).

## Member management

- **Add a member**: Admin → Members → New member. Set first name, last name,
  primary phone number (E.164 format, e.g. `+447700900123`), optional notes.
- **Edit / deactivate**: Admin → Members → select member → Edit / Deactivate.
- **Link a user to a member**: Admin → Members → select member → scroll to
  **Linked users** → **Link a user**, then pick the signed-in user
  account. A single user can be linked to multiple members (themselves
  plus children/dependents). Use the **Deactivate** action on an active
  link if a phone number changes or someone stops representing the
  member.

## Approving signup requests

When a user signs up they may request to represent themselves and any
children/dependents. These requests appear in **Admin → Pending links**.
Approve or reject each link; approved links immediately let the user respond
for those members.

## Creating an event

1. Admin → Events → New event.
2. Set title, date/time, capacity (`capacityMax`), and optional cutoff.
3. Add route stops:
   - One or more `outbound_pickup` stops (required before opening attendance).
   - Optional `event_dropoff`, `event_pickup`, and `return_dropoff` stops.
4. Save as `draft`, then move to `open` and tap **Send attendance request**.

## On the day

- Helpers / admins may update stops if plans change. Stop edits trigger an
  operational notification to attending users.
- When the bus is parked, an admin or assigned helper opens the event and
  taps **Set parked bus location**. This captures GPS coordinates and
  notifies attending users.

## Guest approvals

- Pending guest requests appear in the event's **Guests → Pending** tab.
- The capacity panel shows approved totals and the *potential* total if all
  pending guests were approved.
- Approve or reject each request. The requesting user is notified.

## Capacity warnings

- Admins receive a `capacity_alert` push when the event reaches `near`, `at`,
  or `over` status, or when pending guests could push it over.
- Adjust `capacityMax`, approve/reject pending guests, or contact members to
  resolve overbooking.

## Overrides and corrections

- Admin override: from the **Attendance board**, tap the pencil icon on
  a member's row (or the **Override** button under "Still to confirm"
  for a member who has not yet replied) and choose attending /
  not-attending plus the relevant stops. The response is recorded with
  `isAdminOverride: true` and `overriddenByAdminId: <your uid>`, and an
  `override_member_response` entry is appended to `auditLogs/`. Override
  works after the response cutoff has passed, which is the canonical
  "someone confirmed outside the app" use case.
- For a member with a changed phone number, deactivate the old user/member
  link in **Admin → Member links** and create a new one for their new
  account.

## Notifications

- `attendance_request` — initial confirm-attendance push, sent when an event
  is opened.
- `attendance_reminder` — admin-triggered reminder to anyone with linked
  members who have not responded.
- `pending_guest_reminder` — admin-triggered reminder to users with pending
  guest requests.
- `operational_update` — pickup/route/parked-bus updates. Targets attending
  users + admins + assigned helpers only.
- `guest_approved` / `guest_rejected` — admin guest decisions.
- `capacity_alert` — admin-only capacity warnings.

All notifications are recorded in `notifications/` for audit.

## Attendance history

Admin → History → filter by member, event, status, and date range. Member
responses include denormalised event title and date so historical queries
work without expensive joins.

## Backups and exports

- Schedule weekly Firestore exports in the Firebase console → Cloud Firestore
  → Backups.
- Audit logs (`auditLogs/`) record admin/helper changes.
- Notification deliveries are recorded in `notifications/` to investigate
  delivery issues.

## Disabling a lost or changed phone number

1. Admin → Users → search by phone number → Deactivate.
2. The user's `memberUserLinks` automatically stop being usable because rules
   require both link `status == active` and user `isActive == true`.
3. Create new links pointing to the member's new user account once they have
   re-signed up.
