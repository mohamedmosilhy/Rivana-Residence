# Stakeholders and workflows

## Stakeholders

| Stakeholder | Interest | Touchpoints |
| --- | --- | --- |
| Hotel owner/client | Bookings, brand, control of prices and staff | Admin dashboard, reports, approvals of open questions |
| Guests | Easy, trustworthy booking with an immediate answer; clear price with VAT; safe payment; privacy | Branch websites, Paymob checkout, emails and WhatsApp, manage link |
| Receptionists | Fast daily operations; never double-book | Staff dashboard, PMS (outside Rivana) |
| Managers | Occupancy, revenue, staff compliance, offers | Reports, pricing, services, coupons, cancellation decisions, broadcasts, audit |
| Content editors (if kept) | Website content | CMS |
| External PMS vendor | Not engaged; no API | None |
| Paymob | Payment processor for online payments and refunds | Hosted checkout, callbacks, refund API (ADR 025) |
| WhatsApp Business provider | Delivers codes, confirmations, feedback requests, and consented offers | `WhatsAppSender` adapter (ADR 028) |
| Developers/operators | Maintainable code, safe deploys | Repo, docs, Hostinger VPS, database |

## Workflow 1 — Website booking, confirmed immediately

Decided 2026-11-06 (Q-36, Q-37, Q-40). This replaces the earlier request-to-book workflow, in which a receptionist confirmed each request after checking the PMS.

```mermaid
sequenceDiagram
  participant G as Guest
  participant W as Rivana website/API
  participant P as Paymob
  participant R as Receptionist
  participant H as Hotel PMS (manual)
  G->>W: choose branch, dates, units, extras, coupon
  W-->>G: WhatsApp code to the guest's phone
  G->>W: enter code (phone verified), review with VAT, submit
  W->>W: lock + check Rivana inventory, price, coupon
  alt pay at hotel
    W->>W: create CONFIRMED (one transaction), queue confirmations
    W-->>G: "Confirmed" + reference; email + WhatsApp after commit
  else pay online
    W->>W: create AWAITING_PAYMENT, hold units ~15 min
    W-->>G: redirect to Paymob hosted checkout
    G->>P: pay
    P->>W: signed result (callback)
    alt success, verified
      W->>W: CONFIRMED, queue confirmations
      W-->>G: "Confirmed"; email + WhatsApp after commit
    else failed or expired
      W->>W: PAYMENT_FAILED, units released
      W-->>G: "Payment not completed"
    end
  end
  W-->>R: new-booking alert; listed as "Not yet in hotel system"
  R->>H: enter the booking in the PMS
  alt PMS has the room
    R->>W: Mark entered in hotel system
  else PMS already full (sold outside Rivana)
    R->>W: cross-system conflict: offer another unit, or Manager cancels (refund if paid)
    W-->>G: hotel contacts the guest; cancellation message
  end
```

Rivana's confirmation covers Rivana's inventory only. It does not check the PMS, so a room sold in the PMS but not yet recorded in Rivana can be confirmed online; the guest then already holds a confirmation when staff find the conflict (RK-1).

## Workflow 2 — Reservation taken in the PMS (phone, OTA, walk-in at another desk)

1. The booking exists in the PMS.
2. A receptionist records it in Rivana as **External** (`POST /staff/external-reservations`) with the PMS reference, within the agreed time.
3. If Rivana accepts it, inventory is consumed and the website will not sell that room-night.
4. If Rivana refuses it with `INVENTORY_UNAVAILABLE`, a **cross-system conflict** exists: Rivana already sold that room-night online. The receptionist follows the escalation procedure ([manual-synchronization-procedure.md](../operations/manual-synchronization-procedure.md)).

## Workflow 3 — Reservation taken by Rivana staff (phone or walk-in at Rivana's desk)

Create it in Rivana first, so it is protected by the lock. Then enter it in the PMS. The record is `CONFIRMED`.

## Workflow 4 — Changes and cancellations

Every change made in one system is mirrored in the other by the same person, in the same sitting. Rivana is updated first when the change frees inventory in Rivana's favor; otherwise both are updated immediately. The audit trail records who changed what in Rivana.

Guests do not cancel directly. Until 24 hours before the branch's check-in time on the arrival date they submit a cancellation request (manage link or "My reservations"); after that they contact the hotel. A Manager of the branch or an Admin approves or rejects it with a reason. Approval cancels an unpaid booking at once, or asks Paymob to refund a paid one and cancels it when Paymob confirms. Staff then cancel the booking in the PMS (Q-38).

## Workflow 5 — Maintenance

A receptionist blocks the physical room in Rivana (and in the PMS if it tracks room status). Rivana refuses a block that would oversell. Staff then move the affected reservations first.

## Workflow 6 — Sync every 30 minutes

Every interval (default 30 minutes, set by Admin per branch), the dashboard plays a sound and opens a reminder for the signed-in receptionists of the branch. The receptionist compares the reservations created, changed, or cancelled since the last checkpoint in both systems (and, at opening, the next 14 days of arrivals), fixes differences, and answers **"I have synced"**, which records a **sync checkpoint** for the branch. If the sync takes longer, they answer **"I'm syncing now"** and are reminded again after the follow-up delay (Q-20). Website bookings not yet entered in the PMS are part of every sync. The manager reviews overdue checkpoints and late hotel-system entries weekly.

## Workflow 6a — Fake reservations

Online bookings come only from WhatsApp-verified numbers. When staff spot a fake or abusive booking, a receptionist cancels it if unpaid (a Manager or Admin if paid). A Manager or Admin then opens the guest profile and **blocks the number** with a reason. That number can no longer receive codes or book online at any branch (Q-29).

## Workflow 7 — Front desk

Assign rooms the day before or on arrival, check in, check out, and mark no-shows after the cut-off. The PMS is updated the same way per hotel practice.
