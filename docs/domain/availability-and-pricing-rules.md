# Availability and pricing rules

Status: **Planned**, design accepted 2026-10-24, revised 2026-11-06 (Q-39 several units per booking, Q-44 one kind of date period, Q-45 VAT, Q-48 coupons, Q-49 services; [ADR 027](../adr/027-booking-price-composition.md)). Rules marked *(Q-nn)* depend on an open business decision in [assumptions-and-open-questions.md](../requirements/assumptions-and-open-questions.md). "Listing" means a room type or apartment type (the CMS `Room`); "unit" means one physical room or apartment.

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
| OC-2 | Each unit in a booking carries its own occupancy; a listing is eligible for that unit when `adults ≤ maxAdults` and `children ≤ maxChildren`, using the CMS fields on `Room`. |
| OC-3 | One booking may hold several units (rooms, apartments, or both) at one branch for the same dates (Q-39), up to a per-booking maximum (proposed 5, set in the M10 spec). Different dates per unit need separate bookings. |

## Capacity and availability (ADR 016)

For room type `T` at branch `B` and night `n`:

```text
capacity(T, n) = |{ physical rooms p of T : p.active and no active block on p covers n }|
sold(T, n)     = |{ reservation room lines l of T : l.consumesInventory and l's stay covers n }|
free(T, n)     = capacity(T, n) − sold(T, n)
available(T, stay, q) ⇔ for every night n in stay: free(T, n) ≥ q      (q = units of listing T in the booking)
```

| Rule | Definition |
| --- | --- |
| IN-1 | Only rooms of the requested branch are counted. |
| IN-2 | Inventory-consuming statuses are `AWAITING_PAYMENT` (until its hold expires), `CONFIRMED`, `CHECKED_IN`, and `CHECKED_OUT`. `PAYMENT_FAILED`, `CANCELLED`, and `NO_SHOW` release their nights. |
| IN-3 | Early check-out shortens the stay to the actual departure date, which releases the remaining nights. |
| IN-4 | A listing is **bookable online** when its CMS status is `PUBLISHED`, its branch is `ACTIVE` with online booking enabled and a VAT rate configured (TX-1), it has at least one active unit, and every night of the stay has a resolvable price (PR-3). |
| IN-5 | Publicly, availability is shown per listing as available or not for the requested units, plus how many more units can be added up to the per-booking maximum (never the raw capacity). Staff see `capacity`, `sold`, and `free` per night. |
| IN-6 | Every operation that can reduce `free` runs under the room-type lock and fails with `INVENTORY_UNAVAILABLE` rather than making `free` negative. That covers bookings (including payment holds and late payment successes), date or unit changes, blocks, and unit deactivation *(Q-17: manager override)*. |
| IN-7 | One physical room cannot have two overlapping inventory-consuming assignments, or two overlapping active blocks. It also cannot be assigned while blocked. The first two are database exclusion constraints; the block-versus-assignment check runs under the lock. |
| IN-8 | An `EXTERNAL` reservation consumes inventory exactly like any other. Recording it may fail with `INVENTORY_UNAVAILABLE`. That is a **detected cross-system conflict** and is escalated ([manual-synchronization-procedure.md](../operations/manual-synchronization-procedure.md)). |

## Accommodation prices (scope PDF sections 2–3)

| Rule | Definition |
| --- | --- |
| PR-1 | The accommodation pricing unit is **per unit per night**, in US dollars, stored as integer cents, authored **before VAT**. Guest count does not change the price in v1. |
| PR-2 | Each listing may have one **base rate** and any number of **date periods** `[startDate, endDate)` with a nightly amount and an optional public label ("High season"). There is one kind of period (Q-44). |
| PR-3 | The price of night `n` is the active date period covering `n`, otherwise the base rate. If neither exists, the night is unpriced and the listing is not bookable online for that stay. Staff may still record it with a manual price. |
| PR-4 | Active periods of one listing may not overlap (exclusion constraint), so there is never a precedence question. |
| PR-5 | Accommodation total is the sum of nightly amounts over all units. There is no rounding at this step. |
| PR-6 | Optional services, coupons, and VAT apply only as defined below (SV, CP, TX). No other charge, fee, or tax exists (Q-05). |
| PR-7 | The server is authoritative. The full total shown at review is recomputed inside the booking transaction. If it differs from the total the client confirmed (`expectedTotalMinor`), creation fails with `409 PRICE_CHANGED` and returns the new quote. |
| PR-8 | A reservation stores an immutable snapshot: per-night amount per unit (source `BASE`/`PERIOD`/`MANUAL`, period id, label), each service line, coupon code and value, discount, taxable amount, VAT rate and amount, and total. Later edits never change it. |
| PR-9 | Rates are managed by Manager (assigned branches) and Admin. Receptionists can read rates but cannot change them. |
| PR-10 | A manual nightly override on a staff reservation requires `pricing:override` (Manager or Admin) and a reason, and is audited. |
| PR-11 | Staff modification of dates or units re-quotes changed nights at current rates; unchanged nights keep their snapshot; the coupon value and VAT rate stored on the reservation are re-applied to the new subtotal. The UI shows old and new totals before confirming *(Q-19; prepaid differences Q-66)*. |
| PR-12 | An `EXTERNAL` reservation may store amounts as reported by the PMS, flagged `MANUAL` with source external, or none. Revenue reports exclude unpriced reservations and say so. |
| PR-13 | Rate, service, coupon, and VAT edits are audited with before and after values (scope PDF section 9). |

## Optional services (Q-49)

| Rule | Definition |
| --- | --- |
| SV-1 | A branch may offer `BREAKFAST` and `AIRPORT_TRANSFER`, each with one flat price per booking (integer cents, before VAT) and an on or off switch. |
| SV-2 | A service is added only when the guest (or staff, for a staff booking) selects it. The review may offer unselected services as a cross-sell; accepting one re-quotes. |
| SV-3 | Each selected service appears once per booking, regardless of units, nights, or guests. |
| SV-4 | Services are part of the subtotal, the coupon base, and the VAT base. Approved prices and transfer details are open *(Q-56)*. |

## Coupons (Q-48)

| Rule | Definition |
| --- | --- |
| CP-1 | A code is matched case-insensitively. It is valid when active, inside its optional validity window (server time), valid at the booking's branch (all branches or listed ones), and below its total and per-phone redemption limits. |
| CP-2 | Redemption counts include reservations in `AWAITING_PAYMENT`, `CONFIRMED`, `CHECKED_IN`, `CHECKED_OUT`, and `NO_SHOW`. `PAYMENT_FAILED` releases the redemption; `CANCELLED` releases it too *(Q-57, recommended)*. |
| CP-3 | The booking transaction locks the coupon row (`FOR UPDATE`) before counting redemptions, so limits hold under concurrent bookings. |
| CP-4 | One code per booking. It applies to the whole subtotal (accommodation + services). |
| CP-5 | `PERCENT`: discount = round half-up (subtotal × basis points ÷ 10 000). `FIXED`: discount = min(amount, subtotal). |
| CP-6 | A booking whose total becomes zero cannot choose Paymob; it is pay at hotel. |
| CP-7 | A refused code returns a reason (`NOT_FOUND`, `INACTIVE`, `NOT_YET_VALID`, `EXPIRED`, `WRONG_BRANCH`, `LIMIT_REACHED`, `PHONE_LIMIT_REACHED`). The per-phone check runs once the phone is verified. |

## VAT (Q-45)

| Rule | Definition |
| --- | --- |
| TX-1 | One VAT rate for all branches, entered and changed only by the Admin in the dashboard (any percentage, for example 5%, 6%, or 15%; Q-05), stored as integer basis points (15% = 1500). Online booking cannot be enabled while it is unset. Guests see the line labelled "VAT (n%)". |
| TX-2 | `taxable = subtotal − discount` (never below zero). |
| TX-3 | `vat = round half-up (taxable × basis points ÷ 10 000)`, computed once on the whole booking, never per night, unit, or service. |
| TX-4 | `total = taxable + vat`. Selection screens show accommodation before VAT; the final review and confirmations show subtotal, discount, VAT (with its rate), and total. |
| TX-5 | The reservation stores the rate and amount used; changing the rate affects only later quotes. |

## Worked examples

All amounts in these examples are **illustrations**, not approved prices or rates. Amounts are cents; dollars in brackets.

**Example 1 — date periods** (the scope PDF example, restated in USD). Listing A with periods `2026-09-01 → 2026-09-16` at $60 and `2026-09-16 → 2026-10-01` at $70 (end dates exclusive). A stay from `2026-09-14` to `2026-09-18` prices:

| Night | Amount |
| --- | --- |
| 09-14 | 6000 ($60.00) |
| 09-15 | 6000 |
| 09-16 | 7000 ($70.00) |
| 09-17 | 7000 |
| **Accommodation** | **26000 ($260.00)** |

**Example 2 — full composition.** Two units for three nights: a room at $80 per night and an apartment at $120 per night; breakfast $30 and airport transfer $25 (flat per booking); coupon 15%; VAT rate 15%.

| Step | Calculation | Amount |
| --- | --- | --- |
| Accommodation | 3 × 8000 + 3 × 12000 | 60000 ($600.00) |
| Services | 3000 + 2500 | 5500 ($55.00) |
| Subtotal | | 65500 ($655.00) |
| Discount (15%) | 65500 × 1500 ÷ 10000 = 9825 | −9825 ($98.25) |
| Taxable | | 55675 ($556.75) |
| VAT (15%) | 55675 × 1500 ÷ 10000 = 8351.25 → 8351 | 8351 ($83.51) |
| **Total** | | **64026 ($640.26)** |

**Example 3 — half-up rounding.** Taxable 10010 ($100.10) at 15%: 10010 × 1500 ÷ 10000 = 1501.5 → **1502** ($15.02); total 11512 ($115.12). A 10% coupon on a subtotal of 33333: 3333.3 → **3333**.

**Example 4 — fixed coupon above the subtotal.** Subtotal 4000 ($40.00), fixed coupon $50: discount 4000, taxable 0, VAT 0, total 0; Paymob is not offered (CP-6).
