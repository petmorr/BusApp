# Milestones

The MVP build is broken into the following milestones (see `spec.pdf` for
full deliverables/acceptance criteria).

| # | Milestone | Status |
|---|-----------|--------|
| 1 | Product Finalisation and Setup | Scaffolded in this repo |
| 2 | Authentication and User Foundation | Skeleton screens + repository in place |
| 3 | Member and Representation Management | Models + import script in place |
| 4 | Event and Route Management | Models + Firestore rules in place |
| 5 | Member Attendance Flow | Models + capacity helper in place |
| 6 | Guest Requests and Admin Approval | Callable functions scaffolded |
| 7 | Capacity, Reminders, and Notifications | Capacity recalculation function scaffolded |
| 8 | Helper Operations and Parked-Bus Location | Callable functions scaffolded |
| 9 | Admin Attendance Board and History | Models and indexes in place |
| 10 | Security, Testing, and Release | Security rules drafted; CI scaffolded |

This scaffold is intentionally a foundation; subsequent PRs should flesh out
each feature folder under `app/lib/features/`, harden the Firestore rules,
and add tests under `app/test/` and `functions/test/`.
