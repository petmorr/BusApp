# Product spec summary

The supporters bus attendance app helps a football supporters group manage bus seats for matches and other events. The MVP uses one Flutter app for iOS and Android backed by Firebase Authentication, Cloud Firestore, Cloud Functions, and Firebase Cloud Messaging.

## Core goals

- Let one phone-authenticated user represent one or more member records.
- Let users confirm attendance for linked members and request named guest seats.
- Give admins event attendance boards grouped by attending, not attending, still to confirm, and guest request status.
- Track approved and potential capacity so admins see near, at, over, and pending guest risk states.
- Let helpers update operational route details and parked-bus location for assigned events only.
- Record notifications and audit-worthy admin/helper activity for troubleshooting.

## MVP roles

| Role | Scope |
| --- | --- |
| User | View current/upcoming events, respond for linked members, request guests, choose route stops, open map locations. |
| Helper | User scope plus route/stop notes, parked-bus location, and operational updates for assigned events. |
| Admin | Full access to users, members, links, events, route stops, capacity, guest approvals, reminders, helpers, overrides, and history. |

## Main entities

- `users/{userId}`: Firebase Auth UID, phone number, display name, roles, FCM tokens.
- `members/{memberId}`: Authoritative supporter/member record with repeated phone numbers allowed.
- `memberUserLinks/{linkId}`: Approved or pending representation from one user account to one member.
- `events/{eventId}`: One bus event in the MVP, with status, capacity, cutoff, route summary, and parked-bus pin.
- `events/{eventId}/stops/{stopId}`: Ordered outbound pickup, event drop-off, event pickup, or return drop-off stops.
- `events/{eventId}/memberResponses/{memberId}`: One member attendance response for an event.
- `events/{eventId}/guestRequests/{guestRequestId}`: Named guest request with pending/approved/rejected/cancelled state.
- `notifications/{notificationId}`: Notification audit record.
- `auditLogs/{auditLogId}`: Admin/helper action audit record.

## Current scaffold scope

This repository starts the project with:

- An offline Flutter prototype of the key screens and domain models.
- Capacity calculation in Dart and Cloud Functions TypeScript.
- Firestore rules and index definitions that mirror the MVP model.
- Callable Cloud Functions for guest decisions, attendance reminders, operational updates, parked-bus location, and helper assignment.
- A TypeScript CSV import script for initial member loading.
- Documentation for setup and operations.

Firebase project IDs, branding, initial admins, app store distribution approach, and data retention policy remain open decisions.
