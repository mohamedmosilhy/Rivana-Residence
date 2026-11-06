# M7 — Booking quote: optional services, coupons, VAT

Status: **Not started.** Branch: `m7-booking-quote`. Follow the [milestone loop](./README.md#the-loop-every-milestone-follows).

## Objective

One server-side quote that composes accommodation (several units), optional services, a coupon, and VAT exactly as [ADR 027](../../adr/027-booking-price-composition.md) defines, with the staff APIs to manage services, coupons, and the VAT rate. Reservations do not exist yet; M8 snapshots this quote.

## Read first

- ADR [027](../../adr/027-booking-price-composition.md), ADR [020](../../adr/020-dates-timezones-money.md)
- [domain/availability-and-pricing-rules.md](../../domain/availability-and-pricing-rules.md) (PR, SV, CP, TX rules and worked examples)
- [domain/promotions.md](../../domain/promotions.md) (coupons)
- [database/data-model.md](../../database/data-model.md) (`ServiceOffering`, `Coupon`, `CommercialSettings`)
- [api/api-contracts.md](../../api/api-contracts.md) (P6, S35–S39, A5), [api/error-model.md](../../api/error-model.md) (`COUPON_INVALID`, `SERVICE_UNAVAILABLE`)

## Blocking questions

- Q-56 (service details) and Q-57 (coupon details): recommendations accepted unless the client answers differently.
- Q-05 (decided): the Admin enters the VAT rate in the dashboard. Build it as a nullable Admin-only setting; online booking cannot be enabled until a rate is entered. No rate is hard-coded anywhere.

## Skills for this milestone

| Step | Skill | Notes |
| --- | --- | --- |
| Spec | `/architect` (`FEATURE`) | `QuoteCalculator` signature, coupon validation result type, rounding helper |
| Build | `/develop` (logic track) | Pure domain first with worked examples as tests |
| Tests | `/test` | Table-driven tests for every rounding and capping case |
| Failures | `/debug` | |
| Proof | `/check verify` | Run each worked example through API-P6 |
| Review | `/check review` | Focus: money arithmetic, server authority, coupon enumeration, branch scope |
| After merge | `/sync` | |

## In scope

`QuoteCalculator`, services catalog, coupons with validation, commercial settings with the VAT rate, quote API, staff APIs, rate limits, audit.

## Out of scope (binding)

- Storing reservations, coupon redemptions, or service lines (M8).
- Payment (M9). Admin and Manager screens (M12).
- Any currency other than USD (Q-46).
- Marketing broadcasts (M13).

## Tasks

### 1. Domain (`src/domain/pricing`, `src/domain/coupons`, `src/domain/services`)

1. `roundHalfUpDiv(numerator, denominator)` on integers (no floating point).
2. `QuoteCalculator.compute({ lines: [{ nights: NightPrice[] }], services: [{ kind, priceMinor }], coupon?: CouponValue, vatRateBasisPoints })` returns `{ lines, accommodationMinor, servicesMinor, subtotalMinor, discountMinor, taxableMinor, vatRateBasisPoints, vatMinor, totalMinor }` following the order in ADR 027 (TX-1…5, CP-4…6).
3. `CouponPolicy.validate(coupon, { branchId, phone?, now, redemptionsTotal, redemptionsForPhone })` returns valid or a reason: `NOT_FOUND`, `INACTIVE`, `NOT_YET_VALID`, `EXPIRED`, `WRONG_BRANCH`, `LIMIT_REACHED`, `PHONE_LIMIT_REACHED` (CP-1…3). Codes normalized to upper case.
4. Service kinds `BREAKFAST`, `AIRPORT_TRANSFER`; a service is only added when requested (SV-1…4).

### 2. Database (migration `commercial_rules`)

1. `ServiceOffering` (`branchId`, `kind`, `priceMinor > 0`, `active`, `description?`; unique `(branchId, kind)`).
2. `Coupon` (`code` unique on `upper(code)`, `kind PERCENT|FIXED`, `percentBasisPoints` 1–10000 or `amountMinor > 0` by kind (CHECK), `startsAt?`, `endsAt?` with `endsAt > startsAt`, `maxRedemptions?`, `maxRedemptionsPerPhone?`, `allBranches boolean`, `CouponBranch(couponId, branchId)` join for specific branches, `active`, `description?`, audit columns).
3. `CommercialSettings` singleton: `vatRateBasisPoints` nullable (0–10000, entered by the Admin, Q-05), `updatedAt`, `updatedById`.

### 3. Application

1. `QuoteBooking` use case: resolves branch (active), listings (published, same branch), stay and occupancy per line, units available (reads M6), nightly prices, active services requested, coupon (validated; redemption counts are zero until M8 writes them, read through a port), VAT rate. Returns the full breakdown or field errors. A missing VAT rate yields a quote flagged `vatConfigured: false` and the booking cannot proceed (`BRANCH_NOT_BOOKABLE` reason `VAT_NOT_CONFIGURED`).
2. `ManageServices` (Manager for assigned branches, Admin), `ManageCoupons` (Admin; Manager only for codes limited to their branches, never `allBranches`), `ManageCommercialSettings` (Admin, `tax:manage`). All audited with before and after values.
3. Rate limit quote requests that include a coupon code (per client, e.g. 20 per 10 minutes) to slow code guessing.

### 4. API

- API-P6 `POST /api/v1/quotes` (public).
- API-S35 `GET /api/v1/staff/branches/{branchId}/services`, API-S36 `PUT …/services/{kind}`.
- API-S37 `GET /api/v1/staff/coupons`, API-S38 `POST /api/v1/staff/coupons`, API-S39 `PATCH /api/v1/staff/coupons/{id}`.
- API-A5 `GET` and `PUT /api/v1/staff/settings/commercial`.

## Database impact

One migration, additive. Demo seed: breakfast and transfer offerings with clearly fictional prices on the demo branch only, two demo coupons (one percent, one fixed), and a demo VAT rate in development seeds only, labelled as demo data.

## API impact

P6, S35–S39, A5.

## Acceptance criteria

1. Every worked example in [availability-and-pricing-rules.md](../../domain/availability-and-pricing-rules.md#worked-examples) reproduces to the cent through `QuoteCalculator` and API-P6.
2. VAT is computed once on `taxable` and rounded half-up; a percentage coupon is computed once on `subtotal` and rounded half-up; a fixed coupon larger than the subtotal reduces `taxable` to zero, never below.
3. Services appear in a quote only when requested; an inactive service returns `SERVICE_UNAVAILABLE`.
4. Each coupon refusal reason is returned as `422 COUPON_INVALID` with `context.reason`; codes are matched case-insensitively.
5. A Manager can create a coupon only for branches they are assigned to and can change service prices only there; VAT is Admin-only; every change is audited.
6. The quote never trusts a client-supplied price, discount, or tax value (strict schemas reject them).
7. With no VAT rate set, the quote says so and no booking path accepts it.

## Tests

- Unit: T-QUOTE-1…10 (composition order, rounding at .5 cents, zero services, multi-unit, coupon caps, VAT 0 and 100% bounds), T-CPN-1…5 (validation reasons), T-SVC-1…2, T-TAX-1…2, T-AUTHZ sweep additions.
- Integration: T-CPN-6…8 (persistence, case-insensitive uniqueness, branch scope), T-SVC-3…4, T-TAX-3…4, API-P6 end to end with rate limits, staff APIs with audit.

## Evidence for the report

The worked examples' API responses; audit rows for each change type; the rate-limit response.

## Risks

- Rounding disputes: one rule, documented and tested.
- Coupon guessing: rate limits and audit.

## Handoff

Report, then stop. M8 has not started.
