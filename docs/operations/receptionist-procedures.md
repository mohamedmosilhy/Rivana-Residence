# Receptionist procedures

Status: **Draft for client review.** Screen names refer to the planned staff dashboard (M9). Read with [manual-synchronization-procedure.md](./manual-synchronization-procedure.md).

## Start of shift

1. Sign in at `/admin/login`. You see only your assigned branches.
2. Open the **Overview**: today's arrivals, departures, in-house guests, pending requests, and the last sync checkpoint.
3. Reconcile with the hotel system, including the next 14 days of arrivals, and record a sync checkpoint.

## Sync reminder (every 30 minutes)

When the sound plays and the pop-up opens, compare what changed since the last checkpoint in both systems, fix differences, and press **I have synced**. If you need a few minutes, press **I'm syncing now**; the pop-up comes back after the follow-up delay. Do not press "I have synced" without checking: your name and the time are recorded.

## Website requests (status "Pending")

1. Open the request. Check the dates, room type, guests, and contact details.
2. Check the hotel system for the same room type and nights.
3. If available: enter the booking in the hotel system, tick **I have checked the hotel system**, then **Confirm**. The guest gets an email and a WhatsApp message.
4. If not available, or the details are unusable: **Decline** with a reason. The guest gets an email and a WhatsApp message, and the room is released.

## Phone, email, and walk-in bookings

**Reservations → New → Staff booking.** Rivana checks availability and price. You cannot change prices; ask a manager if a special price is needed. After saving, enter the booking in the hotel system.

## Bookings that already exist in the hotel system

**Reservations → New → External**, with the hotel system's reference. If Rivana reports a conflict, follow the conflict steps in the synchronization procedure.

## Changes and cancellations

- Change dates or room type with **Change stay**. Rivana re-checks availability and shows the old and new totals.
- Guest details and notes: **Edit details**.
- Cancel with **Cancel reservation** and a reason. Choose whether to notify the guest.
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

Decline or cancel the booking with a reason, and tell your manager. A Manager or Admin can open **Guests**, find the phone number, and **Block** it with a reason. A blocked number can no longer get codes or book online at any branch.

## Guests without WhatsApp

Online booking needs a WhatsApp code. Take the booking by phone as a staff booking instead.

## Things never to do

- Never confirm a request without checking the hotel system.
- Never record an external booking twice to "make it fit", or under a different room type to avoid a conflict.
- Never share your account. Never write passwords down.
- Never copy guest details into personal devices or messaging apps.
