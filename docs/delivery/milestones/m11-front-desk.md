# M11 — Front-desk operations

Status: **Not started.** Scope extended by the owner on 2026-11-17: change history, the "changed, update hotel system" flag, change requests in the cancellation queue, service changes with cars, and upcoming airport pickups (Q-82…Q-85). Branch: `m11-front-desk`. Follow the [milestone loop](./README.md#the-loop-every-milestone-follows).

## Objective

Receptionists run the front desk in the dashboard: today's work, reservations with payment status, marking website bookings as entered in the hotel system, staff and external bookings, rooms and blocks, the sync reminder, and guest profiles. Managers and Admins also work the cancellation-request queue.

## Read first

- [frontend/booking-and-operations-ui.md](../../frontend/booking-and-operations-ui.md) (staff screens), [frontend/admin-dashboard.md](../../frontend/admin-dashboard.md), [frontend/route-map.md](../../frontend/route-map.md)
- [operations/receptionist-procedures.md](../../operations/receptionist-procedures.md), [operations/manual-synchronization-procedure.md](../../operations/manual-synchronization-procedure.md)
- [requirements/user-stories-and-acceptance-criteria.md](../../requirements/user-stories-and-acceptance-criteria.md) (US-R1…R7, US-R1a, US-M4, US-M6, US-A4)
- [api/api-contracts.md](../../api/api-contracts.md) (S1–S6, S9–S29, S44, S45, S50–S53, A3)

## Required audit repairs in M11

Include the enquiry detail and archive task from [repairs/m11-front-desk.md](./repairs/m11-front-desk.md) in the M11 task breakdown.

## Blocking questions

- Q-35 (sync pop-up for managers), Q-61 (PMS-entry target time): recommendations accepted unless answered.

## Skills for this milestone

| Step | Skill | Notes |
| --- | --- | --- |
| Spec | `/architect` (`FEATURE`) | Screen inventory, polling strategy, `BroadcastChannel` for the reminder |
| Build | `/develop` (UI track; logic track for the reminder client) | Reuse `admin/ui/*` tables, dialogs, toasts |
| Tests | `/test` | E2E with a fake clock for the reminder |
| Failures | `/debug` | |
| Proof | `/check verify` | Run a shift: arrivals, PMS marking, cancellation decision, block, sync |
| Review | `/check review` | Focus: server-side authorization, `If-Match` handling, no personal data leaks |
| After merge | `/sync` | |

## In scope

Overview desk widgets; reservation list, filters, detail, history, payment status, actions; PMS-entry marking; cancellation queue and decisions; staff booking and external forms; availability grid; units and blocks; sync reminder and branch sync settings; guest profiles and blocking; branch switcher.

## Out of scope (binding)

Pricing, services, coupons, VAT, reports, audit viewer, branch admin beyond sync settings (M12); broadcasts (M13).

## Task breakdown

Planned, reviewed, and accepted one task at a time ([agent-workflow.md](../../engineering/agent-workflow.md)). Rows are confirmed at milestone open; the numbered **Tasks** below hold the detail. This table is provisional: re-confirm it against the code and decisions at milestone open.

| Task | Title | Risk | Depends on | Covers (criteria, tests) | Status |
| --- | --- | --- | --- | --- | --- |
| M11-T1 | Staff shell branch switcher and overview (with changed bookings to update in the hotel system and upcoming airport pickups) | Medium | M9 | AC 1, 2 | Not started |
| M11-T2 | Reservations list and detail (read), with change history, car count, and flight details | Medium | T1 | AC 1 | Not started |
| M11-T3 | Reservation actions on the detail page (confirm dialogs, `If-Match`, `412` reload), including service changes with cars and "Mark change entered" (S55) | Medium | T2 | AC 6 | Not started |
| M11-T4 | New staff booking and external recording | Medium | T2 | AC 4 | Not started |
| M11-T5 | Cancellation and change requests screen (S17–S19, S56–S58) | Medium | T2 | AC 3 | Not started |
| M11-T6 | Availability grid and inventory screens | Low | T1 | axe, E2E | Not started |
| M11-T7 | Sync reminder and branch sync settings | Medium | T1 | AC 5 | Not started |
| M11-T8 | Guests screens | Medium | T1 | AC 1 | Not started |

## Tasks

1. **Overview** (`/admin`): per assigned branch: arrivals, departures, in-house, **website bookings not yet in the hotel system** (with age; highlighted past the target, Q-61), **changed bookings to update in the hotel system** (Q-84), **upcoming airport pickups** (arrival date, cars, flight number, arrival time; Q-82), open cancellation requests (Manager and Admin), last sync checkpoint and next due time.
2. **Reservations** `/admin/reservations`: filters (status, source, payment method and status, "not yet in hotel system", dates, search), pagination; detail `/admin/reservations/[id]` with units, nights, services, coupon, VAT, total, payment and refund status, history, and the actions allowed for the caller (each in a confirm dialog sending `If-Match`): modify stay, edit guest, assign unit, check in, check out, no-show, cancel (unpaid; paid only for Manager and Admin with the refund notice), **Mark entered in hotel system**, resend manage link.
3. **New booking** `/admin/reservations/new?type=staff|external`: staff booking (pay at hotel; optional services and coupon; quote shown) and external recording with the PMS reference and the conflict notice that links to the escalation steps.
4. **Cancellation requests** `/admin/cancellations` (Manager and Admin): open requests with deadline, payment method, amount; approve (shows refund amount and that the payment provider's fee policy applies) or reject with a required reason; refund status and retry. **Change requests** on paid bookings in the same queue (Q-85): current and requested details, old and previewed totals, the difference to settle at the desk; approve (a failed re-check shows the conflict) or reject with a reason.
5. **Availability** `/admin/availability` (grid, 62 nights max) and **Inventory** `/admin/inventory` (units of rooms and apartments, blocks).
6. **Sync reminder** in the staff shell (Q-20): polls API-S29, chime, blocking `alertdialog`, "I have synced" / "I'm syncing now", tab-title fallback, one chime across tabs; the dialog lists the count of website bookings not yet entered in the hotel system.
7. **Branch sync settings** (Admin) on `/admin/branches/[id]`.
8. **Guests** `/admin/guests`, `/admin/guests/[id]`: search, history, marketing consent status (read-only), block and unblock with reason (Manager and Admin).
9. **Branch switcher** in the shell for staff with several branches.
10. **Change history and flag** on reservation detail: every guest and staff change (who, when, old and new totals and details); a "Changed, update hotel system" badge with "Mark change entered" (S55); the "not yet in hotel system" filter includes changed bookings (Q-84). Service changes in the modify dialog include the car count and flight details (Q-82, Q-83).

## Acceptance criteria

1. A receptionist sees only their branches' reservations, guests' reservations, and requests.
2. A new website booking appears as "Not yet in hotel system" and, after "Mark entered", shows who marked it and when; overdue ones are highlighted with a fake clock.
3. A Manager approves a paid request and the screen shows the refund pending and then completed (fake gateway); rejection requires a reason; a receptionist has no decision buttons and the API refuses them.
4. Staff booking and external recording show server errors verbatim (conflict, price changed, coupon refused) and never double-submit.
5. The reminder opens on time on any page, cannot be dismissed without an answer, re-opens after the follow-up delay, and clears for every receptionist of the branch after one "I have synced".
6. A stale action returns `412` and the screen offers a reload.
7. axe clean; usable from 768 px; lookups usable on phones.
8. A guest change to a booking already entered in the hotel system shows "Changed, update hotel system" on the overview and the detail until a receptionist marks it entered; the change history shows old and new details and totals.
9. A Manager approves a guest change request and the reservation shows the new details; a failed re-check shows the conflict and keeps the request open; a receptionist cannot decide.
10. The overview lists upcoming airport pickups with car count and flight details.

## Tests

E2E-R-1…7, E2E-M-3, E2E-M-6; component tests for `SyncReminder`, `ReservationActions`, `CancellationDecision`.

## Evidence for the report

Screenshots of each screen and dialog; the reminder sequence with the fake clock; a cancellation approval with refund states.

## Risks

- Staff ignore the PMS-entry marker (RK-2): manager review and overview highlight.

## Handoff

Close the milestone ([README steps 8–15](./README.md#the-loop-every-milestone-follows)), report, then stop. M12 has not started.
