# Receptionist procedures

Status: **Draft for client review**, revised for immediate confirmation and online payment (2026-11-06). Screen names refer to the planned staff dashboard (M11). Read with [manual-synchronization-procedure.md](./manual-synchronization-procedure.md).

## Start of shift

1. Sign in at `/admin/login`. You see only your assigned branches.
2. Open the **Overview**: today's arrivals, departures, in-house guests, website bookings not yet in the hotel system, and the last sync checkpoint.
3. Reconcile with the hotel system, including the next 14 days of arrivals, and record a sync checkpoint.

## Sync reminder (every 30 minutes)

When the sound plays and the pop-up opens, compare what changed since the last checkpoint in both systems, fix differences, and press **I have synced**. If you need a few minutes, press **I'm syncing now**; the pop-up comes back after the follow-up delay. Do not press "I have synced" without checking: your name and the time are recorded.

## New website bookings (already "Confirmed")

Website bookings are confirmed by Rivana immediately; nobody approves them. Rivana has **not** checked the hotel system.

1. Open each booking in **Not yet in hotel system** (newest alerts also arrive by email).
2. Enter it in the hotel system: dates, units, guests, contact, extras (breakfast, transfer), and whether it is paid online or pays at the hotel.
3. Press **Mark entered in hotel system**.
4. If the hotel system has no room for it, do not cancel it yourself: follow *Conflicts* in the synchronization procedure and call your Manager.

## Cancellation requests

Guests can ask to cancel online until 24 hours before check-in time. Managers and Admins approve or reject requests; you cannot. If a guest calls about a request, check its status on the reservation and pass the call to a Manager if needed. After a request is approved, cancel the booking in the hotel system too.

## Phone, email, and walk-in bookings

**Reservations → New → Staff booking.** Rivana checks availability and price (with extras, coupon, and VAT). Staff bookings are paid at the hotel. You cannot change prices; ask a manager if a special price is needed. After saving, enter the booking in the hotel system.

## Bookings that already exist in the hotel system

**Reservations → New → External**, with the hotel system's reference. If Rivana reports a conflict, follow the conflict steps in the synchronization procedure.

## Changes and cancellations

- Change dates or room type with **Change stay**. Rivana re-checks availability and shows the old and new totals.
- Guest details and notes: **Edit details**.
- Cancel unpaid bookings with **Cancel reservation** and a reason. Choose whether to notify the guest. Bookings paid online can only be cancelled by a Manager or Admin, because cancelling refunds the guest.
- Make the same change in the hotel system straight away.

## Arrivals and departures

- **Assign room** before or at arrival. Only suitable free rooms are offered.
- **Check in** on or after the arrival date.
- **Check out** at departure. An early departure shortens the stay automatically.
- **No-show** after the hotel's no-show time on the arrival date.

## Maintenance

**Inventory → Blocks → New block**: choose the room, dates (the end date is the first day it is usable again), and reason. If Rivana refuses because guests are booked, move those reservations first or ask the manager.

## Guests who lost their link

Guests can open **My reservations** on the website with their phone number and a WhatsApp code. You can also use **Resend manage link** on the reservation; this sends a new link by email and WhatsApp and replaces the old one. Never read out or paste links into chat with anyone other than the guest.

## Fake or abusive bookings

Cancel the booking with a reason if it is unpaid (ask a Manager if it was paid online), and tell your manager. A Manager or Admin can open **Guests**, find the phone number, and **Block** it with a reason. A blocked number can no longer get codes or book online at any branch.

## Guests without WhatsApp

Online booking needs a WhatsApp code. Take the booking by phone as a staff booking instead.

## Things never to do

- Never leave a website booking unmarked: enter it in the hotel system and mark it entered.
- Never record an external booking twice to "make it fit", or under a different room type to avoid a conflict.
- Never share your account. Never write passwords down.
- Never copy guest details into personal devices or messaging apps.
