# SPEC-1 — Supporters Bus Attendance App

The authoritative product spec is the PDF stored at
[`docs/spec.pdf`](spec.pdf). The summary below is a quick reference for
contributors; if anything contradicts the PDF, the PDF wins.

## Background

A football supporters group needs a mobile app for iOS and Android to manage
attendance for supporters buses travelling to matches and related events.
Members receive a push notification per game/event and confirm whether they
will take a seat. A single app user may represent multiple members (children,
elderly relatives, people without smartphones). Users can also request
additional non-member guest seats. Admins manage events, capacity, route
stops, helpers, attendance reminders, and guest approvals.

## Goals

- Single Flutter codebase targeting iOS 13+ and Android 7.0 / API 24+.
- Phone-number login with Firebase Auth one-time SMS code.
- Cloud Firestore for data, Cloud Functions for privileged actions, FCM for
  push notifications.
- Strict server-side rules so users can only respond for their linked members,
  helpers can only update operational fields on assigned events, and only
  admins can approve guests, change capacity, or send reminders.

## Domain model

| Entity | Notes |
|--------|-------|
| `users/{userId}` | Firebase Auth UID. Profile + roles (`user`, `helper`, `admin`). |
| `users/{userId}/fcmTokens/{tokenId}` | Push tokens per device. |
| `members/{memberId}` | Supporter record (not a login). Phone number is primary identifier. |
| `memberUserLinks/{linkId}` | Allows a user to respond for one or more members. |
| `events/{eventId}` | Bus event: title, capacity, cutoff, stops, parked-bus location. |
| `events/{eventId}/stops/{stopId}` | Outbound pickup, event drop-off, event pickup, return drop-off. |
| `events/{eventId}/helpers/{userId}` | Per-event helper assignments. |
| `events/{eventId}/memberResponses/{memberId}` | Attendance per member per event. |
| `events/{eventId}/guestRequests/{guestRequestId}` | Named guest seat requests. |
| `notifications/{notificationId}` | Audit of sent push notifications. |
| `auditLogs/{auditLogId}` | Audit of admin/helper actions. |

See [`docs/spec.pdf`](spec.pdf) for full field definitions and validation
rules.

## Capacity

```
confirmedMemberSeats = count(memberResponses where status = attending)
approvedGuestSeats   = count(guestRequests where status = approved)
pendingGuestSeats    = count(guestRequests where status = pending)
approvedSeats        = confirmedMemberSeats + approvedGuestSeats
potentialSeats       = approvedSeats + pendingGuestSeats
nearLimit            = ceil(capacityMax * capacityNearThresholdPercent / 100)

capacityStatus =
  over  if approvedSeats >  capacityMax
  at    if approvedSeats == capacityMax
  near  if approvedSeats >= nearLimit
  under otherwise

pendingGuestRisk = potentialSeats > capacityMax
```

A Cloud Function recalculates these values whenever a `memberResponses` or
`guestRequests` document is written, or when an event's capacity is changed.

## Roles & permissions

- **User** — confirm attendance for linked members, request named guest seats,
  choose pickup / drop-off stops, view current/upcoming events, open map
  locations.
- **Helper** — user permissions plus update parked-bus location, route/stop
  notes, and send operational event updates for assigned events only.
- **Admin** — full access to members, users, links, events, helpers, route
  stops, responses, guest approvals, reminders, capacity, overrides, and
  attendance history.

Custom claims (`admin: true`, `helper: true`) gate Firestore rules and
callable Cloud Functions.

## Notification categories

- `attendance_request`
- `attendance_reminder`
- `pending_guest_reminder`
- `guest_approved`
- `guest_rejected`
- `capacity_alert`
- `operational_update`

Operational updates are sent only to users with at least one attending member
response, plus admins and assigned helpers.
