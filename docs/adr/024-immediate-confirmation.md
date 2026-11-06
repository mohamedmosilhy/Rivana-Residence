# ADR 024 — Immediate confirmation of website reservations

Status: **Accepted** (2026-11-06, client decisions Q-36, Q-38, Q-40, Q-53). Supersedes the request-to-book design of the reservation lifecycle (Q-02) and the guest-cancellation part of [ADR 019](./019-guest-reservation-access.md) (Q-07). Amends the risk mitigations of [ADR 013](./013-self-managed-reservations.md). ADRs 013, 016, and 019 stay as the record of the earlier design.

## Context

The accepted design (2026-10-24) made website bookings requests: they were created `PENDING`, held inventory, and waited for a receptionist to check the hotel's operational system (PMS) and confirm or decline them. That confirmation step was the main mitigation for cross-system double booking (RK-1), because the PMS is not integrated and staff synchronize by hand.

The client has decided that a successful website booking is confirmed immediately, without receptionist approval, and that guests request cancellations which a Manager or Admin approves.

## Problem

How do we confirm website bookings at once, keep "confirmed" truthful, and keep the manual synchronization honest, when Rivana still cannot see the PMS?

## Options considered

1. **Keep request to book.** Rejected by the client.
2. **Confirm immediately and keep `PENDING` as a per-branch fallback mode.** Keeps screens and a mode switch that nobody has asked for.
3. **Confirm immediately; remove `PENDING` and `DECLINED`; track PMS entry separately.**

## Decision

Option 3.

- A website reservation becomes `CONFIRMED` in the same database transaction that reserves its inventory under the room-type lock (ADR 016). For a pay-at-hotel booking that is the submission transaction. For an online payment it is the transaction that processes Paymob's verified success result ([ADR 025](./025-paymob-online-payment.md)); until then the reservation is `AWAITING_PAYMENT`, which holds inventory briefly but is never shown or messaged as confirmed.
- `PENDING` and `DECLINED` are removed from the status set, the state machine, the API (the old confirm and decline endpoints), and the staff screens. Nothing produces them, and an unused state invites wrong code paths.
- Confirmation messages (email and WhatsApp) are written to the outbox in the confirming transaction and sent only after it commits. A conflict, a failed payment, or an expired hold produces no confirmation.
- Rivana's confirmation is about Rivana's inventory only. It does not verify the PMS. Each new website booking carries a "not yet entered in the hotel system" marker (`pmsEnteredAt` null) until a receptionist marks it entered; overdue markers are highlighted and reviewed by managers (Q-40).
- Guests no longer cancel directly. Until 24 hours before the branch's check-in time on the arrival date they may submit a **cancellation request**; the reservation stays `CONFIRMED` (and keeps its inventory) until a Manager of that branch or an Admin approves it (then `CANCELLED`, with a Paymob refund for paid bookings) or rejects it with a reason. After the deadline the guest contacts the hotel.
- Staff decisions that used to be "decline" (for example the PMS was already full) become a staff cancellation with a reason such as "cross-system conflict", following the conflict procedure.

## Rationale

It is the simplest model that matches the client's decision. Every remaining status is produced by a real flow, and "confirmed" always means that Rivana's database holds the inventory.

## Consequences

- RK-1 (cross-system double booking) rises: a room sold in the PMS but not yet recorded in Rivana can now be sold and confirmed online with no human check. The guest has already received a confirmation when staff discover the conflict, so relocation or cancellation (with a refund if paid) becomes a guest-facing event. Mitigations: the 30-minute sync reminder, the PMS-entry marker and its target time, external-reservation conflict detection, the per-branch online-booking off switch, and the manager review.
- The anti-squatting control "3 open pending requests per phone" becomes a cap on upcoming pay-at-hotel website bookings per phone (Q-60), because unpaid bookings are now confirmed at once.
- Tests must prove that valid website bookings become `CONFIRMED` immediately, that invalid, unavailable, unpaid, or expired ones never do, and that messages match the committed status.

## Risks

- Staff stop entering website bookings into the PMS promptly because nothing forces them. Mitigation: the marker is visible on the desk overview, the sync reminder lists unentered bookings, and managers review ages.
