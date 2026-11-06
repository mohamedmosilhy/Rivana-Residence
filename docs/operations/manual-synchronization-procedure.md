# Manual synchronization procedure

Status: **Draft for client review**, revised for immediate confirmation (Q-36, 2026-11-06). The 30-minute sync reminder is decided (Q-20); the PMS-entry target is a proposal (Q-61); Q-21 is open. The supporting screens are planned for M11.

> **Important.** Rivana and the hotel's operational system (PMS) are **not connected**. Nothing moves between them automatically. Rivana prevents conflicting bookings **only among the reservations recorded in Rivana**. A booking that exists only in the PMS is invisible to Rivana until a receptionist records it. Until then, the website may offer, **confirm, and take payment for** a room that is already taken, because website bookings are confirmed immediately without any check of the PMS. The later the sync, the higher that risk. This procedure reduces it; it cannot remove it.

## Responsibilities

| Who | Responsibility |
| --- | --- |
| Receptionist on shift | Enter every new website booking in the PMS and mark it entered in Rivana; record PMS bookings in Rivana; mirror changes and cancellations; answer the sync reminder every 30 minutes |
| Manager | Decides guest cancellation requests and paid cancellations (refunds); handles conflicts with confirmed guests; weekly compliance review (PMS-entry ages, checkpoints, conflicts, audit sample) |
| Admin | Staff accounts and branch assignments; turns online booking off for a branch in an emergency |

## When to synchronize

| Event | Action | Target time |
| --- | --- | --- |
| New website booking (already **Confirmed** in Rivana) | Enter it in the PMS, then **Mark entered in hotel system** in Rivana. If the PMS has no room for it, follow *Conflicts* below at once | Within 30 minutes during staffed hours; overnight bookings at the start of the morning shift (Q-61) |
| Guest cancellation request | Manager or Admin approves (refund through Paymob if paid) or rejects with a reason; after approval, cancel the booking in the PMS | Before the guest's arrival; same day where possible |
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
2. In Rivana, open **Reservations** filtered by "changed since last checkpoint" and "Not yet in hotel system" (and **Availability** for the same dates).
3. For each PMS booking missing in Rivana, record it as external. For each Rivana booking missing in the PMS, enter it there and mark it entered. For each mismatch in dates, room type, or cancellation, fix the system that is wrong.
4. Answer the reminder with **"I have synced"** and a short note if something changed ("2 external added"). This records the checkpoint for the whole branch.

How the reminder works: when the branch's last checkpoint is older than the interval (default 30 minutes), every signed-in receptionist of the branch hears a sound and sees a pop-up that stays until someone answers. **"I'm syncing now"** gives you the follow-up delay (default 10 minutes) to finish, then it asks again. When one receptionist answers "I have synced", the reminder clears for everyone at the branch. The Overview always shows the last checkpoint and when the next one is due.

## Conflicts (double booking detected)

A conflict means the same room-night was sold in both systems. With immediate confirmation, the website guest has **already received a confirmation**, and may already have paid online.

1. **Do not cancel anything yet.** Note both references and whether the website booking was paid online.
2. Check whether another unit of the same or a better listing is free in both systems that night. If so, assign it in both systems and tell the affected guest about the change according to hotel policy.
3. If not, escalate to the Manager immediately (phone). The Manager decides which booking is kept, using the hotel's policy (for example: the earlier booking wins, or the one with arrival soonest).
4. If the website booking is the one cancelled, the Manager cancels it in Rivana with the reason "Cross-system conflict". A paid booking is refunded through Paymob automatically by that cancellation; tell the guest personally, by phone or WhatsApp, before or with the automatic message.
5. Record the outcome in both systems so it appears in the audit log and the manager review.

## When Rivana is unavailable

- Take bookings in the PMS only, and keep a list of every booking and change made during the outage.
- If the outage will be long, the Admin may ask the operator to show a maintenance message on the site.
- When Rivana is back, record every listed booking as external, then do a full reconciliation and checkpoint.

## When the PMS is unavailable

Rivana keeps confirming website bookings, so every hour of PMS outage adds bookings that nobody can check against the PMS. Keep a list of them. If the outage will last more than a short time, the Admin should switch **online booking off** for the branch, which leaves the website honest. When the PMS is back, enter every listed booking and mark it entered.

## Manager compliance review (weekly)

- Website bookings entered in the PMS later than the target (or not yet), and their causes.
- Cancellation requests and refunds: decided in time, refund failures resolved.
- Overdue reminders and gaps in the checkpoint history.
- Conflicts and their outcomes.
- An audit sample of five reservations: they match the PMS.
- Actions agreed with staff.

## Audit

Every booking, PMS-entry mark, external recording, change, cancellation, cancellation decision, refund, block, and checkpoint in Rivana is recorded with the user, time, and reason. The PMS's own history is outside Rivana.

## Future integration

If the PMS vendor provides an API, the `HotelSystemSync` port (ADR 013) is where an adapter would plug in, under a new ADR. Until then this procedure is the integration.
