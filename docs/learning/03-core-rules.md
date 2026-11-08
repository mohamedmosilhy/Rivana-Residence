# 3. Core rules: availability, pricing, lifecycle (designed, not coded; M6–M9)

## Dates
- Stay is `[checkIn, checkOut)`; nights = dates before checkout. 10th→12th = 2 nights.
- Overlap iff `a.in < b.out && b.in < a.out`; back-to-back stays are fine.
- `YYYY-MM-DD`, impossible dates rejected; public check-in not before "today" in the branch time zone.
- Proposed (open): max 30 nights, horizon 540 days. Several units per booking, same dates, proposed max 5.

## Availability
```
capacity = active physical units not blocked that night
sold     = reservation lines in an inventory-consuming status
free     = capacity - sold      (needs free >= requested on EVERY night)
```
- Consuming: AWAITING_PAYMENT (until hold expires), CONFIRMED, CHECKED_IN, CHECKED_OUT. Others free the nights.
- Public sees only available/not; staff see capacity/sold/free.
- Every availability-reducing write (booking, hold, late payment, date change, block, unit deactivation) runs **under the listing's DB lock**, fails with `INVENTORY_UNAVAILABLE` rather than going negative.
- Exclusion constraints stop overlapping assignments/blocks per physical room.
- Recording an EXTERNAL booking can fail this check: that is how a PMS conflict is detected.

## Pricing formula (integer cents, USD)
1. Nightly price = date period covering the night, else base rate, else unpriced (not bookable online). Periods of a listing cannot overlap.
2. Accommodation = sum over units and nights. Services flat per booking, only if chosen.
3. Subtotal = accommodation + services. Coupon on whole subtotal (percent rounded half-up, or fixed capped at subtotal).
4. Taxable = subtotal - discount. VAT = taxable x rate, rounded half-up **once** per booking. Total = taxable + VAT.
- Example: 600 + 55 = 655; 15% coupon -98.25; VAT 15% on 556.75 = 83.51; total 640.26.
- Server recomputes inside the booking transaction; client sends `expectedTotalMinor`; mismatch = `409 PRICE_CHANGED` with the new quote. Reservation stores an **immutable price snapshot**.
- Coupons: case-insensitive, validity window, branch restriction, redemption limits; coupon row locked `FOR UPDATE` before counting. Zero total cannot use Paymob.

## Lifecycle
```
website pay-at-hotel -> CONFIRMED
website Paymob -> AWAITING_PAYMENT -> CONFIRMED | PAYMENT_FAILED
staff / external -> CONFIRMED
CONFIRMED -> CANCELLED | CHECKED_IN -> CHECKED_OUT | NO_SHOW
```
- No reversal of terminal states; create a new reservation instead.
- Cancellation request is a separate record; booking stays CONFIRMED (keeps inventory) while open. Approve unpaid = cancel now; paid = Paymob refund first, cancelled when Paymob confirms; refund failure = request `REFUND_FAILED` + retry.

## Every transition
One transaction re-reading the reservation `FOR UPDATE`; staff use `version` (412 on mismatch); audit event in the same transaction; email/WhatsApp written to an **outbox** in the same transaction and sent after commit.

## Payments (Paymob)
Hold ~15 min; only HMAC-verified server callback changes payment state; each provider event processed once; late success confirmed only if units still free, else auto-refund; expiry job every minute; full refunds only.

## Also
- Idempotency: `POST` creates need `Idempotency-Key`; same key+body returns original; same key+different body = 422.
- Reference `RR-` + 8 random Crockford base32 chars (not secret). Access via manage token (only its hash stored).

## Remember
Free = capacity - sold on every night under a DB lock; fixed formula, server recompute, snapshot; one state machine with audit + outbox per transition.

Read: `docs/domain/availability-and-pricing-rules.md` (worked examples at the bottom).
