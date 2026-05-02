# Operational runbook

## Member administration

1. Keep `members` as the authoritative list of supporters.
2. Use `memberUserLinks` to allow one phone login to represent one or more members.
3. Set signup-created links to `pending` until an admin approves them.
4. Deactivate old links when a member changes phone number or no longer needs representation.

## Creating an event

1. Create an `events/{eventId}` document with title, event date, status, capacity, and optional cutoff.
2. Add route stops under `events/{eventId}/stops`.
3. Ensure at least one active `outbound_pickup` stop before opening attendance.
4. Set status to `open`.
5. Use `sendAttendanceRequest` to notify users linked to active members.

## Attendance management

- Members are confirmed immediately when a linked user marks them as attending.
- Guest requests start as `pending` and require admin approval.
- The capacity function records confirmed member seats, approved guest seats, pending guest seats, approved total, potential total, status, and pending guest risk on the event document.
- Admins can override member responses after cutoff.

## Reminder types

- Attendance request: all users representing active members.
- Attendance reminder: users with at least one linked active member without a response.
- Pending guest reminder: users with pending guest requests.
- Operational update: attending users, admins, and assigned helpers.

Keep attendance reminders separate from operational updates so admins can audit intent and targeting.

## Helper operations

Helpers are assigned per event under `events/{eventId}/helpers/{userId}`. They may update route/stop operational data and parked-bus location for assigned events. They may not manage members, approve guests, or send attendance reminders.

## Parked-bus location

1. Admin/helper opens the assigned event.
2. They pin the parked-bus location explicitly.
3. The app stores latitude, longitude, label, notes, updater, and timestamp on `events/{eventId}.parkedBusLocation`.
4. Send an operational update to attending users when the location changes.

## Launch checklist

- Import and validate active members.
- Assign first production admins with custom claims.
- Create a sample event and test attendance, guest approval, reminder, and operational update flows.
- Confirm Firestore rules with emulator tests before production.
- Confirm push notification delivery on iOS and Android internal test builds.
- Document manual fallback for members without compatible smartphones.
