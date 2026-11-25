# Reservation lifecycle

Status: **Partly implemented.** M8 implemented pay at hotel and staff reservation workflows. M9-T2 implemented pure payment, hold, deadline and request rules. M9-T4 implemented the online hold, hosted checkout and expiry during booking creation. M9-T5 implemented callback processing, confirmation release and late success. M9-T6 implemented the scheduled hold expiry and payment reconciliation jobs. Design accepted 2026-10-24 and revised on 2026-11-06 by the client decisions Q-36 (immediate confirmation), Q-37 (online payment or pay at hotel), Q-38 (cancellation requests), and Q-39 (several units per booking); see ADRs [024](../adr/024-immediate-confirmation.md) and [025](../adr/025-paymob-online-payment.md). The earlier request-to-book design (`PENDING`, `DECLINED`, confirm and decline by staff, guest cancellation of pending requests) is superseded and kept only in the accepted M1–M3 history and ADRs 013 and 019.

## States

| State | Meaning | Consumes inventory |
| --- | --- | --- |
| `AWAITING_PAYMENT` | Website booking with online payment chosen; units held for about 15 minutes while the guest pays on the payment page. Never shown or messaged as confirmed | Yes (until `holdExpiresAt`) |
| `CONFIRMED` | Rivana's database holds the inventory: a pay-at-hotel website booking at submission, an online booking after a verified payment success, or a staff or external booking | Yes |
| `PAYMENT_FAILED` | Online payment failed, was abandoned, or the hold expired before a success; nothing was confirmed | No |
| `CANCELLED` | Cancelled by staff (reason required) or by an approved guest cancellation request; refunded first when paid | No |
| `CHECKED_IN` | Guest has arrived; a physical unit is assigned to each line | Yes |
| `CHECKED_OUT` | Stay completed; an early departure shortens the stay | Yes (historical nights only) |
| `NO_SHOW` | Guest did not arrive | No |

`PENDING` and `DECLINED` do not exist (ADR 024). Holds exist only for online payment and always expire. Inventory is otherwise taken only when a reservation is created.

A **cancellation request** is not a status: it is a separate record attached to a `CONFIRMED` reservation (below).

## State machine

```mermaid
stateDiagram-v2
  [*] --> CONFIRMED: website (pay at hotel) / staff-created / external recorded
  [*] --> AWAITING_PAYMENT: website (online)
  AWAITING_PAYMENT --> CONFIRMED: verified payment success (in time, or late with units still free)
  AWAITING_PAYMENT --> PAYMENT_FAILED: payment failed / hold expired
  CONFIRMED --> CANCELLED: staff cancel (reason) / approved cancellation request (after refund if paid)
  CONFIRMED --> CHECKED_IN: check in (staff, on/after check-in date, units assigned)
  CONFIRMED --> NO_SHOW: no-show (staff, on/after check-in date)
  CHECKED_IN --> CHECKED_OUT: check out (staff)
  PAYMENT_FAILED --> [*]
  CANCELLED --> [*]
  NO_SHOW --> [*]
  CHECKED_OUT --> [*]
```

## Transitions

| Transition | Who (capability) | Preconditions | Effects |
| --- | --- | --- | --- |
| create website, pay at hotel → `CONFIRMED` | Public, rate-limited | Valid phone verification token (GV-2) for a non-blocked phone; per-phone cap (Q-60); branch active with online booking enabled; every listing bookable; valid stay and occupancy per unit; coupon valid (CP-1…3); total equals `expectedTotalMinor`; inventory free for every unit under lock; idempotency key | Guest profile upserted (marketing opt-in recorded if ticked); reference, manage token, price snapshot, coupon redemption, audit; confirmation by email and WhatsApp queued in the same transaction (sent after commit); staff alert; flagged "not yet in hotel system" |
| create website, online → `AWAITING_PAYMENT` | Public, rate-limited | As above, plus at most one open hold per phone (Q-60) | Same writes, but the confirmations are written as `HELD` outbox rows, released only when the payment succeeds (spec 0006, D-A); `holdExpiresAt = now + 15 min`; after commit a gateway checkout session is created (ADR 025) |
| payment success `AWAITING_PAYMENT → CONFIRMED` | payment callback (verified by the gateway adapter) | Amount and currency equal the payment; reservation still `AWAITING_PAYMENT`, or `PAYMENT_FAILED` by expiry with every unit still free under lock (PY-5) | Payment `SUCCEEDED`; confirmation by email and WhatsApp queued; staff alert; audit |
| payment failure or expiry → `PAYMENT_FAILED` | payment callback, or the hold-expiry job, or a booking transaction for the same listings | Not yet confirmed | Inventory and coupon redemption released; "payment not completed" message; audit |
| create (staff) → `CONFIRMED` | `reservations:create` + branch | As website, minus public-only rules; pay at hotel; manual price needs `pricing:override` | Audit; confirmation by email and WhatsApp if staff tick "send" |
| record external → `CONFIRMED` | `reservations:record-external` + branch | `externalReference` required and unique per branch; inventory free under lock, otherwise a conflict is reported | Audit, flagged source `EXTERNAL`; already in the PMS, so no PMS-entry flag |
| mark entered in hotel system *(implemented M8-T10)* | `reservations:pms-entry` + branch | `WEBSITE` source; `pmsEnteredAt` not set | Sets `pmsEnteredAt` and `pmsEnteredById`; audit |
| mark change entered in hotel system *(implemented M8-T9, Q-84; names the latest `changeSeq`)* | `reservations:pms-entry` + branch | A pending "changed, update hotel system" flag | Clears the flag with user and time; audit |
| cancel (staff), unpaid | `reservations:cancel` + branch | `CONFIRMED`; not paid online | Inventory and coupon redemption released (Q-57, idempotent); optional guest message; audit; a booking already entered in the hotel system gets a numbered `CANCEL` change and the "changed, update hotel system" flag (Q-84) |
| cancel (staff), paid | `reservations:cancel-paid` (Manager, Admin) + branch | `CONFIRMED`; payment `SUCCEEDED` | Refund requested through the payment gateway; `CANCELLED` when the gateway confirms; then release and messages; audit (Q-62) |
| modify stay or services *(implemented M8-T9 and M8-T9b)* | `reservations:modify` | `CONFIRMED`; new dates or units pass inventory under locks for old and new listings; re-quote with VAT (PR-11); prepaid differences per Q-66 | New snapshot for changed nights and services, version bump and change history. A booking already entered in the hotel system gets the update flag (GC-6). History and audit record service kinds, car counts and whether retained details changed. Flight text stays in the reservation snapshot. |
| guest change *(planned M9, Q-83…Q-85)* | Manage token or guest session for the reservation's phone | See [Guest changes](#guest-changes-q-83q-85) | Same as modify stay; guest and staff messages |
| edit guest details/notes *(implemented M8-T10)* | `reservations:modify` | Not terminal | Audit (personal fields redacted to "changed") |
| assign unit *(implemented M8-T10)* | `reservations:front-desk` | Unit of the same listing and branch, active, unblocked, not assigned to an overlapping stay | Exclusion constraint is the final guard; audit |
| check in *(implemented M8-T10)* | `reservations:front-desk` | `CONFIRMED`; branch today ≥ check-in; every line assigned | Audit |
| no-show *(implemented M8-T10)* | `reservations:front-desk` | `CONFIRMED`; branch today ≥ check-in | Inventory released; no automatic refund (Q-65); audit |
| check out *(implemented M8-T10)* | `reservations:front-desk` | `CHECKED_IN`; branch today > check-in (arrival-day checkout is refused with `INVALID_TRANSITION`, Q-79) | If branch today < check-out, shorten the operational stay to today (IN-3) and keep the price snapshot unchanged (Q-76); feedback request queued (M13, ADR 028); audit |

Every transition:

- runs in one transaction that re-reads the reservation `FOR UPDATE` and checks the expected `version` (optimistic concurrency, `412` on mismatch) where staff act;
- appends an `AuditEvent` in the same transaction;
- writes any email or WhatsApp message as an outbox row in the same transaction, sent after commit, so a message never describes a state that was rolled back.

## Cancellation requests (Q-38)

| Rule | Definition |
| --- | --- |
| CX-1 | A guest may request cancellation strictly before the **deadline**, which is 24 hours before the branch's `checkInTime` on the arrival date in the branch time zone. A branch without a check-in time offers no online requests. |
| CX-2 | Only `CONFIRMED` reservations can have a request; at most one active request per reservation (`OPEN`, `APPROVED`, `REFUND_PENDING` or `REFUND_FAILED`; also none while the refund is pending) **Implemented (M9-T2, M9-T7).** Requests come from the manage link or a guest session for the reservation's phone. A blocked phone keeps manage link read access only (Q-75). |
| CX-3 | While the request is open the reservation stays `CONFIRMED` and keeps its inventory. |
| CX-4 | A Manager of the branch or an Admin (`cancellations:decide`) approves or rejects. Rejection needs a reason, which is sent to the guest. |
| CX-5 | Approval of an unpaid booking sets `CANCELLED` and releases inventory at once. Approval of a paid booking requests a gateway refund of the captured amount; the reservation becomes `CANCELLED` when the gateway confirms. A refund failure leaves it `CONFIRMED` with the request `REFUND_FAILED` and a retry action. |
| CX-6 | At or after the deadline, the guest sees the branch's contact details. Staff may still cancel under the transitions above. A booking made inside the 24-hour window can never be requested online (Q-64). |
| CX-7 | Request, decision, refund attempt, and result are each audited and messaged (email and WhatsApp). |

**Implemented (M9-T7).** A request writes the audit, guest receipt, and branch email alert together. Unpaid staff cancellation, no-show, or check-in closes an open request and records the staff member, reason, time, and audit in the same transaction (Q-96 and Q-97). **Implemented (M9-T8).** Managers of the branch and Admins decide requests (S17 to S19); a paid approval or paid staff cancellation starts the full refund after commit, and `CompleteRefund` finishes it only for the current attempt. A failed refund keeps the booking `CONFIRMED`, alerts the branch by email, says nothing to the guest, and can be retried without limit. While a cancellation refund is pending, check in and no show are refused; a failed refund does not block them. A refund that completes after the booking moved on (checked in) refunds the money, does not cancel, and alerts the branch.

*(Transition rules implemented M9-T2.)* Request states: `OPEN → APPROVED → (REFUND_PENDING → COMPLETED | REFUND_FAILED → retry)`, `OPEN → REJECTED` or `OPEN → CLOSED`. For unpaid bookings `APPROVED` goes straight to `COMPLETED`.

## Guest changes (Q-83…Q-85)

**Implemented:** the staff change engine (M8-T9 and M8-T9b) and guest changes to confirmed, priced pay-at-hotel bookings (M9-T10). **Planned:** paid booking changes and approvals (M9-T11).

| Rule | Definition |
| --- | --- |
| GC-1 | A guest may change dates, units and listings (same branch, at most 5 units, Q-69), adults and children per unit, services (add, remove, number of cars, flight details), name, email, and special requests. Phone, branch, payment method, and coupon are not changeable online; an existing coupon is kept as in Q-76. |
| GC-2 | Allowed only for `CONFIRMED` reservations, before the CX-1 deadline computed on both the current and the new arrival date, with no `OPEN` cancellation or change request, from the manage link or a guest session for the reservation's phone. A blocked phone cannot change (Q-75). |
| GC-3 | A preview re-quotes under PR-11 without writing. Applying re-runs the quote inside the transaction, under the room-type locks for old and new listings, and requires the previewed total (`409 PRICE_CHANGED` otherwise) and the reservation version (`412` on mismatch). |
| GC-4 | Pay at hotel: the change applies at once (ADR 024). Paid online: applies at once when the new total equals the paid total; otherwise an `OPEN` change request is stored with the requested change and holds no inventory (Q-85). |
| GC-5 | A Manager of the branch or an Admin approves or rejects a change request with a reason, in the cancellation-request queue. Approval re-checks inventory and prices under the locks and applies the change, or fails with the conflict shown; the difference is settled at the desk (Q-66). |
| GC-6 | Every applied change appends a change-history row (actor kind guest or staff, before and after totals and details), an audit event without personal values, outbox messages (`RESERVATION_MODIFIED`, and the staff alert), and, when `pmsEnteredAt` is set, a pending "changed, update hotel system" flag. |

On pay-at-hotel changes, the preview returns a full quote and the booking version. Apply rechecks both arrival deadlines, access, inventory, and price under the locks. Replacing the booking email sends a minimal notice to the previous address and revokes the old manage link. A replacement goes only by WhatsApp to the existing phone when usable. The hotel handles recovery when the booking has no usable phone.

Change request states: `OPEN → APPROVED` (applied) or `OPEN → REJECTED`; an approval whose re-check fails leaves the request `OPEN` with the conflict shown.

## Payments (ADR 025)

| Rule | Definition |
| --- | --- |
| PY-1 | Website guests choose `ONLINE` (full prepayment) or `PAY_AT_HOTEL`. Staff and external reservations are `PAY_AT_HOTEL` or unpriced. |
| PY-2 | An online booking is created `AWAITING_PAYMENT` with a 15 minute inventory hold. The gateway session expires after 13 minutes. |
| PY-3 | Only a callback verified by the gateway adapter with the expected amount and currency changes payment state. Browser returns are display only. Implemented in M9-T5 (`ProcessPaymentCallback`). |
| PY-4 | Each provider transaction is processed once (unique event id); repeats are acknowledged and ignored. Implemented in M9-T5: a duplicate of an applied event changes nothing. |
| PY-5 | A success after the hold expired is confirmed if every unit is still free under the room-type lock; otherwise it is refunded automatically, and the guest and staff are told (Q-63). Implemented in M9-T5. A late confirmation re-acquires the coupon use without a limit check, because the guest paid the stored price. |
| PY-6 | Website, staff, and external booking creation expire overdue holds under the listing locks (implemented M9-T4). A job also expires holds every minute under the reservation lock only (implemented M9-T6). |
| PY-7 | Refunds are full refunds of the captured amount through the gateway's API; Rivana does not calculate fees. Partial refunds are not offered (Q-66). |
| PY-8 | No card data is received or stored; secrets are server-only. |

## Reversals

Undoing a terminal state is **not** in v1 (Q-18). Reinstating a cancelled reservation is done by creating a new one, which re-checks inventory and price. Undoing a mistaken check-in requires an Admin data correction, which is audited.

## Reservation sources

| Source | Created by | Initial state | Notes |
| --- | --- | --- | --- |
| `WEBSITE` | Guest | `CONFIRMED` (pay at hotel) or `AWAITING_PAYMENT` (online) | Staff enter it in the PMS and mark it entered (Q-40) |
| `STAFF` | Receptionist and up | `CONFIRMED` | Phone, walk-in, or email request; pay at hotel; staff also enter it in the PMS |
| `EXTERNAL` | Receptionist and up | `CONFIRMED` | Already in the PMS; `externalReference` required; recorded here to consume inventory |

Blocks are not reservations and have their own lifecycle: active, then cancelled. A block's end date can be shortened, but extending it re-checks inventory.

## Reference generation

- Format: `RR-` plus 8 characters of Crockford base32 (no `I`, `L`, `O`, `U`), generated from a cryptographically secure random source: about 1.1 × 10¹² values.
- There is a unique database constraint. On a collision the server regenerates, up to 3 attempts, inside the same transaction.
- References are not sequential, so they leak neither volume nor order. They are not secrets (ADR 019).

## Idempotency

- `POST` create endpoints require an `Idempotency-Key` header (8–128 visible ASCII characters). Without it the request is rejected with `400`.
- The key's scope is the source plus actor: `WEBSITE` with no actor ID, or the staff user ID for staff and external creation. The server stores the key's hash and a SHA-256 fingerprint of the normalized request body on the reservation row, under a unique constraint.
- A matching replay returns `200` with the original reference, current status, and `manageUrl: null`. An online replay includes the checkout URL while the gateway session is live. If the deadline is still in the future and there is no stored URL, Rivana retries checkout with the original payment ID.
- The same key with a different body returns `422 IDEMPOTENCY_KEY_REUSED`.
- Two matching requests for one verified phone serialize on the guest row and can replay the committed booking. The database uniqueness constraint also protects concurrent key reuse across different phones.
- Retention: the key stays with the reservation. A failure before the booking commits rolls back the key. A checkout failure after commit leaves the booking available for replay.
- Payment callbacks have their own idempotency (PY-4).
