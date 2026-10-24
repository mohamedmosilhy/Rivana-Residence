# Availability and pricing rules

Status: **Planned**, design accepted 2026-10-24. Rules marked *(Q-nn)* depend on an open business decision in [assumptions-and-open-questions.md](../requirements/assumptions-and-open-questions.md).

## Date semantics (ADR 020)

| Rule | Definition |
| --- | --- |
| AV-1 | A stay is `[checkIn, checkOut)`. Check-in is inclusive; check-out is exclusive. |
| AV-2 | Nights are the dates `checkIn, checkIn+1, …, checkOut−1`. Night count is `checkOut − checkIn` in days. |
| AV-3 | Two stays overlap if and only if `a.checkIn < b.checkOut && b.checkIn < a.checkOut`. Back-to-back stays (one checks out on the day the other checks in) do **not** overlap. |
| AV-4 | `checkOut > checkIn`. A zero-night stay is invalid (`422`). |
| AV-5 | Public check-in must be on or after the branch's "today" in its time zone. Staff may record past-dated stays only for `EXTERNAL` reconciliation and corrections (audited). |
| AV-6 | Night count is at most `maxStayNights` (proposed 30) *(Q-09)*. |
| AV-7 | Check-in is at most `bookingHorizonDays` ahead (proposed 540) *(Q-09)*. |
| AV-8 | Dates are `YYYY-MM-DD` calendar dates. Impossible dates such as `2027-02-30` are rejected. Leap days are valid only in leap years. |
| AV-9 | Same-day bookings are allowed until a cut-off time in the branch time zone; the default is no cut-off *(Q-09)*. |

## Occupancy

| Rule | Definition |
| --- | --- |
| OC-1 | A request has `adults ≥ 1` and `children ≥ 0`. |
| OC-2 | A room type is eligible when `adults ≤ maxAdults` and `children ≤ maxChildren`, using the existing CMS fields on `Room`. |
| OC-3 | v1 books one room per reservation *(Q-12)*. A party larger than any room type is told to contact the hotel or make separate bookings. |

## Capacity and availability (ADR 016)

For room type `T` at branch `B` and night `n`:

```text
capacity(T, n) = |{ physical rooms p of T : p.active and no active block on p covers n }|
sold(T, n)     = |{ reservation room lines l of T : l.consumesInventory and l's stay covers n }|
free(T, n)     = capacity(T, n) − sold(T, n)
available(T, stay, q) ⇔ for every night n in stay: free(T, n) ≥ q      (v1: q = 1)
```

| Rule | Definition |
| --- | --- |
| IN-1 | Only rooms of the requested branch are counted. |
| IN-2 | Inventory-consuming statuses are `PENDING`, `CONFIRMED`, `CHECKED_IN`, and `CHECKED_OUT`. `DECLINED`, `CANCELLED`, and `NO_SHOW` release their nights. |
| IN-3 | Early check-out shortens the stay to the actual departure date, which releases the remaining nights. |
| IN-4 | A room type is **bookable online** when its CMS status is `PUBLISHED`, its branch is `ACTIVE` with online booking enabled, it has at least one active physical room, and every night of the stay has a resolvable price (PR-3). |
| IN-5 | Publicly, availability is a boolean per room type. Staff see `capacity`, `sold`, and `free` per night. |
| IN-6 | Every operation that can reduce `free` runs under the room-type lock and fails with `INVENTORY_UNAVAILABLE` rather than making `free` negative. That covers bookings, date or type changes, blocks, and physical-room deactivation *(Q-17: manager override)*. |
| IN-7 | One physical room cannot have two overlapping inventory-consuming assignments, or two overlapping active blocks. It also cannot be assigned while blocked. The first two are database exclusion constraints; the block-versus-assignment check runs under the lock. |
| IN-8 | An `EXTERNAL` reservation consumes inventory exactly like any other. Recording it may fail with `INVENTORY_UNAVAILABLE`. That is a **detected cross-system conflict** and is escalated ([manual-synchronization-procedure.md](../operations/manual-synchronization-procedure.md)). |

## Pricing (scope PDF sections 2–3)

| Rule | Definition |
| --- | --- |
| PR-1 | The pricing unit is **per room per night**, in US dollars, stored as integer cents. Guest count does not change the price in v1. |
| PR-2 | Each room type may have one **base rate**, and any number of **rate periods** `[startDate, endDate)` with a nightly amount, a kind (`SEASONAL` or `OFFER`), and an optional public label ("Summer offer"). |
| PR-3 | The price of night `n` is the first match in this order: active `OFFER` period covering `n`, then active `SEASONAL` period covering `n`, then base rate *(Q-06)*. If none matches, the night is unpriced and the room type is not bookable online for that stay. Staff may still record it with a manual price. |
| PR-4 | Periods of the **same kind** for the same room type may not overlap (exclusion constraint). Different kinds may overlap, and PR-3 decides. |
| PR-5 | Quote total is the sum of nightly amounts. There is no rounding, because amounts are integers. |
| PR-6 | There are no taxes, service charges, fees, or discounts until approved *(Q-05)*. |
| PR-7 | The server is authoritative. The quote shown in the browser is recomputed inside the booking transaction. If it differs from the quote the client confirmed (`expectedTotalMinor`), creation fails with `409 PRICE_CHANGED` and returns the new quote. |
| PR-8 | A reservation stores a per-night snapshot (amount, source `BASE`/`SEASONAL`/`OFFER`/`MANUAL`, period id, label). Later rate edits never change it. |
| PR-9 | Rates are managed by Manager (assigned branches) and Admin (scope PDF section 7). Receptionists can read rates but cannot change them. |
| PR-10 | A manual nightly override on a reservation requires `pricing:override` (Manager or Admin) and a reason, and is audited. |
| PR-11 | Staff modification of dates or room type re-quotes changed nights at current rates. Unchanged nights keep their snapshot. The UI shows old and new totals before confirming *(Q-19)*. |
| PR-12 | An `EXTERNAL` reservation may store amounts as reported by the PMS, flagged `MANUAL` with source external, or none. Revenue reports exclude unpriced reservations and say so. |
| PR-13 | Rate edits are audited with before and after values (scope PDF section 9). |

## Worked examples

These follow the scope PDF examples, with the amounts restated in US dollars (the PDF used EGP). Room A with periods `2026-09-01 → 2026-09-16` at $60 and `2026-09-16 → 2026-10-01` at $70. Both are `SEASONAL`, and end dates are exclusive. A stay from `2026-09-14` to `2026-09-18` prices:

| Night | Amount |
| --- | --- |
| 09-14 | 6000 ($60.00) |
| 09-15 | 6000 |
| 09-16 | 7000 ($70.00) |
| 09-17 | 7000 |
| **Total** | **26000 ($260.00)** |

"Summer Offer", `OFFER` from `2027-06-01` to `2027-07-01` at $50, overrides any seasonal price for June nights of Room X.
