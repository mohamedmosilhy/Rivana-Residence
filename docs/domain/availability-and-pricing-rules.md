# Availability and pricing rules

Status: **Partly implemented.** M7-T1 (quote arithmetic, service price units, 2026-11-11) and M7-T2 (coupon validation and code rules, service offering rules, 2026-11-11) are accepted as pure domain code; their persistence, APIs, and the quote use case are planned for M7-T3 to T6. M6-T1's shared values and M6-T2's pure availability, nightly price, and inventory reduction rules were accepted 2026-11-08. M6-T4's transaction bound inventory reader, lock, and reduction guard foundation was accepted 2026-11-09. Physical unit creation, editing, and guarded deactivation (M6-T5, accepted 2026-11-09) are the first concrete inventory writer. Block create and extension read sold nights with the consumption port's `readFutureSold` from the block start and keep only nights inside the range, so work follows consumption rather than block length; a dedicated range method is deferred to M8 if needed. Base rate and date period authoring (M6-T7, accepted 2026-11-10) adds staff APIs S30 to S34 and the exact nightly calendar read; T8 adds uncached search/grid reads and T10 exposes public accommodation prices through P5; reservation snapshots remain M8 work. Block writers (M6-T6: create, extend or shorten, note, cancel, with listing lock, sparse sold reads, and exclusion mapping; implemented, accepted 2026-11-09), rate writers and M6 APIs are implemented; commercial and reservation rules remain planned for later milestones. Design accepted 2026-10-24, revised 2026-11-06 (Q-39 several units per booking, Q-44 one kind of date period, Q-45 VAT, Q-48 coupons, Q-49 services; [ADR 027](../adr/027-booking-price-composition.md)). Rules marked *(Q-nn)* depend on an open business decision in [assumptions-and-open-questions.md](../requirements/assumptions-and-open-questions.md). "Listing" means a room type or apartment type (the CMS `Room`); "unit" means one physical room or apartment.

## Date semantics (ADR 020)

**Implemented foundation (M6-T1):** `LocalDate` and `StayRange` provide calendar arithmetic, exclusive checkout, and overlap. `validatePublicStay` separately applies the public date policy; `localDateAt` derives today from an explicitly supplied instant and branch zone. Blocks and rate periods do not inherit public stay limits. Public availability API P5 enforces these helpers in M6-T10. Evidence: [M6 report](../delivery/reports/m6-inventory-and-availability.md).

| Rule | Definition |
| --- | --- |
| AV-1 | A stay is `[checkIn, checkOut)`. Check-in is inclusive; check-out is exclusive. |
| AV-2 | Nights are the dates `checkIn, checkIn+1, …, checkOut−1`. Night count is `checkOut − checkIn` in days. |
| AV-3 | Two stays overlap if and only if `a.checkIn < b.checkOut && b.checkIn < a.checkOut`. Back-to-back stays (one checks out on the day the other checks in) do **not** overlap. |
| AV-4 | `checkOut > checkIn`. A zero-night stay is invalid (`422`). |
| AV-5 | Public check-in must be on or after the branch's "today" in its time zone. Staff may record past-dated stays only for `EXTERNAL` reconciliation and corrections (audited). |
| AV-6 | Night count is at most `maxStayNights`, default 30 (Q-09, accepted for M6). |
| AV-7 | Check-in is at most `bookingHorizonDays` ahead, default 540 (Q-09, accepted for M6). |
| AV-8 | Dates are `YYYY-MM-DD` calendar dates. Impossible dates such as `2027-02-30` are rejected. Leap days are valid only in leap years. |
| AV-9 | Same-day bookings have no cut-off by default (Q-09, accepted for M6). There is no minimum stay beyond AV-4's positive night count. |

## Occupancy

| Rule | Definition |
| --- | --- |
| OC-1 | A request has `adults ≥ 1` and `children ≥ 0`. |
| OC-2 | Each unit in a booking carries its own occupancy; a listing is eligible for that unit when `adults ≤ maxAdults` and `children ≤ maxChildren`, using the CMS fields on `Room`. |
| OC-3 | One booking may hold several units (rooms, apartments, or both) at one branch for the same dates (Q-39), up to 5 units across all listings (Q-69, owner accepted 2026-11-08 at M6 open). Different dates per unit need separate bookings. P5 accepts `unitsRequested` from 1 to 5, default 1 (Q-68). |

## Capacity and availability (ADR 016)

**Implemented calculation (M6-T2):** `AvailabilityCalculator.check` in `src/domain/inventory/` checks supplied nightly counts for a positive safe integer quantity and reports the earliest insufficient night. Missing dates have zero capacity and sold; negative free counts are preserved. `checkInventoryReduction` checks block overlap, consuming assignments, and projected capacity on supplied positive sold dates. Block edits replace the old range; inactive or already blocked units are not subtracted twice. Deactivation takes an explicit effective branch date, with no public horizon truncation. Long reductions inspect sparse dates and assignment ranges without expanding empty dates. Inputs must already be scoped to one listing and unit. T4 through T8 supply the database reads, authorization, locks, audited writers and concurrency proof. T10 exposes the public read, with reservation consumption intentionally empty until M8.

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
| IN-4 | A listing is **bookable online** when its CMS status is `PUBLISHED`, its branch is `ACTIVE` with online booking enabled, it has at least one active unit, and every night of the stay has a resolvable price (PR-3). |
| IN-5 | Publicly, availability is shown per listing as available or not for the requested units, plus how many more units can be added up to the per-booking maximum (never the raw capacity). Staff see `capacity`, `sold`, and `free` per night. |
| IN-6 | Every operation that can reduce `free` runs under the room-type lock and fails with `INVENTORY_UNAVAILABLE` rather than making `free` negative. That covers bookings (including payment holds and late payment successes), date or unit changes, blocks, and unit deactivation. There is no Manager or Admin override (Q-17, accepted for M6). |
| IN-7 | One physical room cannot have two overlapping inventory-consuming assignments, or two overlapping active blocks. It also cannot be assigned while blocked. The first two are database exclusion constraints; the block-versus-assignment check runs under the lock. |
| IN-8 | An `EXTERNAL` reservation consumes inventory exactly like any other. Recording it may fail with `INVENTORY_UNAVAILABLE`. That is a **detected cross-system conflict** and is escalated ([manual-synchronization-procedure.md](../operations/manual-synchronization-procedure.md)). |

**Search versus booking (Q-70, owner accepted 2026-11-08):** public availability search may return inventory and accommodation prices for published listings of an active branch while online booking is disabled. Search availability does not promise that reservation creation is enabled, does not hold inventory, and does not bypass IN-4 or the later creation readiness checks. Inactive branches remain hidden.

## Accommodation prices (scope PDF sections 2–3)

**Implemented resolver (M6-T2):** `NightlyPriceResolver.resolve` in `src/domain/pricing/` returns immutable ordered nightly amounts, sources, period ids, and labels. It uses an active covering period, otherwise base, otherwise explicit unpriced values. Any gap makes the accommodation total null; complete totals use checked integer addition and quantity multiplication. Overlapping active periods are rejected rather than assigned precedence. The worked example below resolves to 26000 cents. Rate authoring and its PostgreSQL `INTEGER` bound, database exclusions, APIs, persisted reservation snapshots, and manual override authorization remain future work. Public response shaping is not implemented by this internal resolver.

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
| PR-11 | Staff modification of dates or units re-quotes changed nights at current rates; unchanged nights keep their snapshot; a service with a per night or per person per night unit keeps the unit price and child price stored on the reservation and is recomputed for the new number of nights and guests, never at the branch's current service price (owner decision 2026-11-11), and a per booking service stays as it was; the coupon value and VAT rate stored on the reservation are re-applied to the new subtotal. The UI shows old and new totals before confirming *(Q-19; prepaid differences Q-66)*. |
| PR-12 | An `EXTERNAL` reservation may store amounts as reported by the PMS, flagged `MANUAL` with source external, or none. Revenue reports exclude unpriced reservations and say so. |
| PR-13 | Rate, service, coupon, and VAT edits are audited with before and after values (scope PDF section 9). |

## Optional services (Q-49)

| Rule | Definition |
| --- | --- |
| SV-1 | A branch may offer `BREAKFAST` and `AIRPORT_TRANSFER`, each with a **price unit** (`PER_BOOKING`, `PER_NIGHT`, `PER_PERSON`, `PER_PERSON_PER_NIGHT`), an adult price in integer cents before VAT, an optional child price (person units only; none means children are not charged), and an on or off switch. Staff set all of them per branch (Q-49 amended 2026-11-11). |
| SV-2 | A service is added only when the guest (or staff, for a staff booking) selects it. The review may offer unselected services as a cross-sell; accepting one re-quotes. |
| SV-3 | Each selected service appears once per booking as one line with its unit, quantities and amount. Quantities: `PER_BOOKING` 1; `PER_NIGHT` the stay's nights; `PER_PERSON` adults at the adult price and children at the child price; `PER_PERSON_PER_NIGHT` the same times nights. Guests are summed over every unit of the booking (OC-2). The amount is exact integer arithmetic, with no rounding. |
| SV-4 | Services are part of the subtotal, the coupon base, and the VAT base. Approved prices, units, and child pricing are staff data and open with the client *(Q-56)*. |

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
| TX-1 | One VAT rate for all branches, entered and changed only by the Admin in the dashboard (any percentage, for example 5%, 6%, or 15%; Q-05), stored as integer basis points (15% = 1500). The rate is never empty: it starts at 15% and the Admin may change it to any value from 0% to 100%; values below 0 or above 100 are refused (Q-05 amended 2026-11-11). Guests see the line labelled "VAT (n%)". |
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

**Example 2 — full composition.** Two units for three nights: a room at $80 per night and an apartment at $120 per night; breakfast $30 and airport transfer $25 (both per booking units); coupon 15%; VAT rate 15%.

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

**Example 5 — service units** (illustration only, not approved prices). One room at 8000 per night for three nights; 2 adults and 1 child. Breakfast per person per night, adult 1000, child 500: (2 × 1000 + 1 × 500) × 3 = 7500. Airport transfer per booking 2500. Subtotal 24000 + 7500 + 2500 = 34000; no coupon; VAT 15%: 34000 × 1500 ÷ 10000 = 5100; total 39100.
