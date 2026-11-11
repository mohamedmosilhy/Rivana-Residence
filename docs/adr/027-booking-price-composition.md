# ADR 027 — Booking price composition: date prices, optional services, coupons, and VAT; promotion popup retired

Status: **Accepted** (2026-11-06, client decisions Q-05, Q-44, Q-45, Q-47, Q-48, Q-49). **Amended 2026-11-11 by the owner:** the VAT rate is never null and starts at 15%, and service prices use a configurable unit (Q-05, Q-49). The VAT rate is whatever the Admin sets in the dashboard, between 0% and 100%. Amends [ADR 020](./020-dates-timezones-money.md), which kept tax logic and percentage rules out of the domain, and replaces the marketing-only promotion design ([domain/promotions.md](../domain/promotions.md), Phase 5). ADR 020 stays in force for dates and integer money.

## Context

The accepted pricing design priced each night by base rate and `SEASONAL`/`OFFER` periods, with no taxes, fees, services, or discounts. Promotions were marketing campaigns shown in a public popup with a code that Rivana never validated. The client now wants coupon codes that change the price, optional breakfast and airport transportation, VAT shown separately at the final review, and no popup.

## Problem

How is a booking total built so that it is exact, explainable, server-authoritative, and stored as an immutable snapshot?

## Decision

**Composition (one order, always)**

```text
accommodation = Σ over units Σ over nights nightly price          (PR-3: date period, else base)
services      = Σ chosen services' price × quantity of its unit    (Q-49, amended 2026-11-11)
subtotal      = accommodation + services
discount      = coupon(subtotal)                                    (Q-48; 0 without a code)
taxable       = subtotal − discount                                 (never below 0)
vat           = roundHalfUp(taxable × vatRateBasisPoints / 10000)   (Q-45)
total         = taxable + vat
```

- Amounts are integer cents (ADR 020). Percentages are stored as integer basis points (15% = 1500). The only rounding steps are the percentage coupon and VAT, each rounded half-up to the cent once on the whole amount, never per night or per line.
- Selection screens show accommodation prices before VAT. The final review shows each line, the discount, VAT as a separate line, and the total. The quote API returns every component.
- **Date prices:** one kind of rate period. Periods for one listing may not overlap; a night inside a period takes the period's price, otherwise the base price (Q-44). `OFFER` and precedence rules are removed.
- **Services:** `ServiceOffering` per branch and kind (`BREAKFAST`, `AIRPORT_TRANSFER`), with a `priceUnit` (`PER_BOOKING`, `PER_NIGHT`, `PER_PERSON`, `PER_PERSON_PER_NIGHT`), an adult price, an optional child price for the person units, and an `active` switch (amended 2026-11-11: the flat price per booking is now one of four units), managed by Manager (assigned branch) and Admin. A service is added only when the guest selects it; the review may offer unselected services as an optional cross-sell.
- **Coupons:** `Coupon` with a case-insensitive unique code, `PERCENT` (basis points) or `FIXED` (cents) value, optional validity window, optional total and per-phone redemption limits, branch scope (all or listed branches), and an `active` switch. One code per booking. A fixed amount is capped at the subtotal. Managed by Admin, and by Managers for codes limited to their branches. Validation happens on the server in the quote and again inside the booking transaction, which locks the coupon row (`FOR UPDATE`) before counting redemptions so limits hold under concurrency. A `CouponRedemption` row is written with the reservation and released when the reservation's payment fails or (Q-57, recommended) it is cancelled.
- **VAT:** one rate for all branches in a commercial settings record. Only the Admin (`tax:manage`) enters or changes it, as any percentage with up to two decimals (for example 5%, 6%, 15%), on the Admin-only VAT setting (Q-05). Guests see the line labelled "VAT (n%)". Each reservation stores the rate it used. The rate is never empty: it starts at 15% (seeded data) and the Admin may set any value from 0% to 100%; a value below 0 or above 100 is refused (amended 2026-11-11).
- **Snapshot:** a reservation stores, immutably, the per-night amounts per unit, each service line, the coupon code and value used, the discount, the taxable amount, the VAT rate and amount, and the total. Later edits to rates, services, coupons, or VAT never change it. The client's `expectedTotal` must equal the server's recomputed total, otherwise `409 PRICE_CHANGED` returns the new quote.

**Promotions**

- The public promotion popup and the CMS promotions area are retired (M5). The `Promotion` table stays read-only for one release and is then dropped in a later expand-and-contract migration. Accepted Phase 5 and Phase 7 reports keep showing the popup as it was built.
- Offers and codes reach guests through WhatsApp marketing broadcasts ([ADR 028](./028-whatsapp-guest-messaging.md)), not through the website.

## Rationale

A single, documented order of operations makes every total reproducible from its snapshot. Basis points and one rounding step per percentage keep the arithmetic exact and testable. Locking the coupon row reuses the transaction that already serializes inventory, so usage limits need no separate mechanism.

## Consequences

- New tables `ServiceOffering`, `Coupon`, `CouponRedemption`, `ReservationService`, and commercial settings; new price columns on `Reservation`.
- `PriceResolver` becomes `QuoteCalculator` in the pricing domain: pure functions over nights, services, coupon, and VAT rate, unit-tested with worked examples.
- Reports show revenue excluding VAT, and VAT separately.

## Risks

- Tax treatment is legally sensitive. Mitigation: the rate starts at 15% as seeded data and is owned and changed by the client's Admin, never hard-coded in logic; the label is the neutral "VAT (n%)"; changes are audited and never alter existing bookings.
- Coupon abuse (guessing or sharing codes). Mitigation: rate limits on quote requests, per-phone limits, branch scope, validity windows, audit.
