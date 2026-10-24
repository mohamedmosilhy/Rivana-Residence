# Manual synchronization procedure

Status: **Draft for client review.** The 30-minute sync reminder is decided (Q-20); other times are proposals (Q-11, Q-21). The supporting screens are planned for M9.

> **Important.** Rivana and the hotel's operational system (PMS) are **not connected**. Nothing moves between them automatically. Rivana prevents conflicting bookings **only among the reservations recorded in Rivana**. A booking that exists only in the PMS is invisible to Rivana until a receptionist records it. Until then, the website may offer a room that is already taken. This procedure reduces that risk; it cannot remove it.

## Responsibilities

| Who | Responsibility |
| --- | --- |
| Receptionist on shift | Confirm or decline website requests; record PMS bookings in Rivana; mirror changes and cancellations; answer the sync reminder every 30 minutes |
| Manager | Weekly compliance review (pending ages, checkpoints, conflicts, audit sample); approves exceptions |
| Admin | Staff accounts and branch assignments; turns online booking off for a branch in an emergency |

## When to synchronize

| Event | Action | Target time |
| --- | --- | --- |
| New website request (`PENDING`) | Check the PMS; if free, enter it in the PMS, then **Confirm** in Rivana; if not, **Decline** with "No availability in hotel system" | Within 4 working hours (Q-11) |
| Booking made in the PMS (phone, OTA, travel agent, walk-in at another desk) | **Record external reservation** in Rivana with the PMS reference | Within 30 minutes during staffed hours |
| Booking taken by Rivana staff | Create it in **Rivana first**, then in the PMS | Immediately |
| Change or cancellation in either system | Make the same change in the other system in the same sitting | Immediately |
| Room out of service | Block it in Rivana (and in the PMS) | Before the room is next sellable |
| Sync reminder (sound and pop-up) | Reconcile changes since the last checkpoint (below), then answer **"I have synced"**. If it will take a few minutes, answer **"I'm syncing now"** first | Every 30 minutes (Admin can change the interval per branch) |
| Start of the day | Also check the next 14 days of arrivals in both systems | Daily |

## How external reservations are entered

1. Open **Reservations → New → External** for the branch.
2. Enter the PMS reference, guest name and contact, room type, dates, guests, and the price if known.
3. Save.
   - **Saved**: done. The website will no longer sell that room-night.
   - **"No availability in Rivana" (conflict)**: do not force anything. Go to *Conflicts* below.
   - **"Already recorded"**: the PMS reference exists. Open the linked reservation and check that it matches.

## Reconciliation (every reminder)

1. In the PMS, list the bookings created, changed, or cancelled since the last checkpoint (and, at the start of the day, arrivals for the next 14 days). Use the PMS's report or export if it has one (Q-21).
2. In Rivana, open **Reservations** filtered by "changed since last checkpoint" (and **Availability** for the same dates).
3. For each PMS booking missing in Rivana, record it as external. For each Rivana booking missing in the PMS, enter it there. For each mismatch in dates, room type, or cancellation, fix the system that is wrong.
4. Answer the reminder with **"I have synced"** and a short note if something changed ("2 external added"). This records the checkpoint for the whole branch.

How the reminder works: when the branch's last checkpoint is older than the interval (default 30 minutes), every signed-in receptionist of the branch hears a sound and sees a pop-up that stays until someone answers. **"I'm syncing now"** gives you the follow-up delay (default 10 minutes) to finish, then it asks again. When one receptionist answers "I have synced", the reminder clears for everyone at the branch. The Overview always shows the last checkpoint and when the next one is due.

## Conflicts (double booking detected)

A conflict means the same room-night was sold in both systems.

1. **Do not cancel anything yet.** Note both references.
2. Check whether another room of the same or a better type is free in both systems that night. If so, assign it and inform the affected guest of the change according to hotel policy.
3. If not, escalate to the Manager immediately (phone). The Manager decides which booking is kept, using the hotel's policy (for example: the earlier booking wins, or the one with arrival soonest).
4. Record the outcome in both systems. Cancel or modify in Rivana with the reason "Cross-system conflict" so it appears in the audit log and the manager review.

## When Rivana is unavailable

- Take bookings in the PMS only, and keep a list of every booking and change made during the outage.
- If the outage will be long, the Admin may ask the operator to show a maintenance message on the site.
- When Rivana is back, record every listed booking as external, then do a full reconciliation and checkpoint.

## When the PMS is unavailable

Rivana keeps taking website requests (they are `PENDING`). Do not confirm requests you cannot check. If the outage is long, the Admin may switch **online booking off** for the branch, which leaves the website honest.

## Manager compliance review (weekly)

- Pending requests older than the target, and their causes.
- Overdue reminders and gaps in the checkpoint history.
- Conflicts and their outcomes.
- An audit sample of five reservations: they match the PMS.
- Actions agreed with staff.

## Audit

Every confirmation, decline, external recording, change, cancellation, block, and checkpoint in Rivana is recorded with the user, time, and reason. The PMS's own history is outside Rivana.

## Future integration

If the PMS vendor provides an API, the `HotelSystemSync` port (ADR 013) is where an adapter would plug in, under a new ADR. Until then this procedure is the integration.
