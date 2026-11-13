# 0004. Booking quote: optional services, coupons, VAT (M7)

**Date**: 2026-11-11
**Status**: In Progress (spec approved by the owner; the status moves with the milestone)
**Owner approval**: Spec and six task breakdown approved, 2026-11-11
**Mode**: FEATURE
**Branch**: `m7-booking-quote`

## Summary

M7 adds one server side quote that adds up accommodation for several units, optional services, one coupon, and VAT, in the single order ADR 027 defines. It also adds the staff APIs to manage services, coupons, and the VAT rate. Nothing is stored for a reservation yet; M8 will snapshot this quote. Every number comes from the server, and the client can never send a price, discount, or tax value.

## Context

M6 is accepted and merged. Available today: shared date, stay, occupancy and money values (`src/domain/shared`), the pure nightly price resolver and availability calculator (`src/domain/pricing`, `src/domain/inventory`), the transaction bound availability reader, `RateRepository`, the public availability search (P5), the public rate limiter (`src/application/shared/public-rate-limit-*`), the audit log, the capability list (which already contains `pricing:read`, `services:manage`, `coupons:manage`, and `tax:manage`), and the HTTP wrappers with the single problem serializer.

Not available: any commercial table, any quote code, the reservation tables (M8), and redemption data. The branch table already has `onlineBookingEnabled`. The project stays one Next.js application on PostgreSQL and Prisma, with no dependency changes proposed. The installed Route Handlers guide in `node_modules/next/dist/docs/` governs the new handlers.

### Decision provenance

| Input | Source and disposition |
| --- | --- |
| ADR 027, TX-1…5, SV-1…4, CP-1…7, PR-5, PR-13 | Binding. The spec implements them and adds no business rule. |
| Q-05 (amended 2026-11-11) | Owner decided: the VAT rate is **never null**. It starts at the default **15%** (1500 basis points) and the Admin can change it to any value from 0% to 100%. **0% is valid.** A value below 0 or above 100 is refused with a `422`. The Admin cannot clear the rate. This replaces the earlier "no rate until the Admin enters one" rule, so online booking is no longer gated on a VAT rate. |
| Q-56 | Brief: recommendations accepted. Approved prices are entered by staff, not coded. No example price anywhere except labelled demo seed data. Transfer details (flight number, arrival time) are optional plain text on the reservation line, an M8 field. M7 stores no transfer details. |
| Q-57 | Brief: recommendations accepted. Codes are case insensitive; no minimum nights or amount; a fixed amount is capped at the subtotal; redemption release on cancellation is an M8 write. |
| Owner answer 2026-11-11 | Redemption counts reach `CouponPolicy` through a port with an empty adapter until M8. No `CouponRedemption` table in M7. |
| Owner answer 2026-11-11 | P6 lines stay as documented: one entry per unit, `{ roomSlug, occupancy }`, at most 5 units in total (Q-69). |
| Owner answers 2026-11-11 | Managers see and edit only coupons whose branches are all within their assignment. P6 has a general limit of 60 requests per minute per client, plus 20 coupon attempts per 10 minutes. The USD `currency` columns refinement and the local choices in this spec are accepted as written. |

In scope: `QuoteCalculator`, rounding helper, `CouponPolicy`, service kinds, migration `commercial_rules`, demo seed, services and coupon and VAT management use cases, staff APIs S35 to S39 and A5, `QuoteBooking`, public API P6 with its coupon rate limit, audit, tests, evidence.

Out of scope (binding, from the brief): reservations, coupon redemptions, service lines on reservations (M8); payment (M9); Admin and Manager screens (M12); currencies other than USD (Q-46); marketing broadcasts (M13); `CouponRedemption` and `ReservationService` tables.

## Requirements

User stories: a guest sees a full, exact price breakdown before booking; a Manager sets service prices and creates coupons for assigned branches; the Admin sets the VAT rate and any coupon.

Acceptance criteria keep the brief's numbering:

1. **AC-1**: Every worked example in `availability-and-pricing-rules.md` (1 to 5) reproduces to the cent through `QuoteCalculator` and through API-P6 (example 2 totals 64026, example 3 rounds 1501.5 to 1502 and 3333.3 to 3333, example 4 gives total 0, example 5 totals 39100 with per person per night breakfast and a child price).
2. **AC-2**: VAT is computed once on `taxable` and rounded half up. A percentage coupon is computed once on `subtotal` and rounded half up. A fixed coupon above the subtotal makes `taxable` zero, never below. VAT 0% and 100% both work.
3. **AC-3**: A service appears only when requested. An inactive or missing service returns `409 SERVICE_UNAVAILABLE` with `context.kind`.
4. **AC-4**: Each refusal reason returns `422 COUPON_INVALID` with `context.reason` and `fieldErrors.couponCode`. Codes match case insensitively. The response never reveals other codes, counts, or other guests' use.
5. **AC-5**: A Manager creates coupons only for assigned branches (never `allBranches`) and changes service prices only there. VAT is Admin only. Every change is audited in the same transaction with before and after values.
6. **AC-6**: The quote never trusts a client price, discount, tax, or total. Strict schemas reject unknown and money fields.
7. **AC-7** (replaces the brief's "no VAT rate set" criterion, owner decision 2026-11-11): The VAT rate is never null. The settings row starts at 1500 (15%). A PUT with a value below 0, above 10000, or not an integer is refused with `422` and changes nothing. The database enforces `NOT NULL` and the 0 to 10000 CHECK. A new quote after a change uses the new rate; the default is data in the migration, not a constant in code.

## Decision

Pure arithmetic and policy in the domain; one `QuoteBooking` use case that composes M6 readers and the new commercial ports; staff use cases that follow the M6 `manage-rates` shape (authorize, authorizeBranch, audited transaction); thin Route Handlers. Implementation workflow per task: `/develop` logic track, `/test`, `/check verify`, and an independent `/check review uncommitted` on a different model. No UI skill needed.

### Decision 1. Integer money, one rounding helper

`roundHalfUpDiv(numerator, denominator)` in `src/domain/shared/money.ts` (or a sibling file in the same folder) works on safe integers only, with bigint intermediate arithmetic so `taxable × basisPoints` cannot lose precision. Only nonnegative inputs are in play, so half up and half away from zero agree. It rejects a zero denominator and any non safe result. No floating point anywhere in the quote path (T-QUOTE-10). (Basis: ADR 020, ADR 027.)

### Decision 2. `QuoteCalculator` signature

```text
QuoteCalculator.compute({
  lines:    [{ nights: NightPrice[] }],        // from NightlyPriceResolver, all priced
  guests:   { adults, children },              // summed over all units
  services: [{ kind, unit, price, childPrice }], // already filtered to requested and active
  coupon?:  { kind: "PERCENT", percentBasisPoints } | { kind: "FIXED", amount: Money },
  vatRateBasisPoints: number                   // 0 to 10000, never null
}) → {
  lines, serviceLines: [{ kind, unit, priceMinor, childPriceMinor, adults, children, nights, adultQuantity, childQuantity, amountMinor }],  // adults, children, nights are the booking's counts; quantities are the unit's multipliers
  accommodationMinor, servicesMinor, subtotalMinor,
  discountMinor, taxableMinor,
  vatRateBasisPoints, vatMinor, totalMinor
}
```

Order is ADR 027 exactly: accommodation, services, subtotal, discount (percent: `roundHalfUpDiv(subtotal × bp, 10000)`; fixed: `min(amount, subtotal)`), taxable `= subtotal − discount`, VAT `= roundHalfUpDiv(taxable × bp, 10000)`, total `= taxable + VAT`. Services are one line each per booking (SV-3 as amended 2026-11-11): the line amount is the service's adult price times its adult quantity plus its child price (or nothing when it has none) times its child quantity, with quantities from the service's price unit (`PER_BOOKING` 1, `PER_NIGHT` nights, `PER_PERSON` guests, `PER_PERSON_PER_NIGHT` guests times nights). Guests are summed over all units; nights come from the one stay. The function is pure, takes no clock, and throws a typed domain error on an unpriced night so the application layer never reaches it with one. Currency is USD, carried by the existing `Money` value.

### Decision 3. VAT is never null, default 15% (owner decision 2026-11-11)

`CommercialSettings.vatRateBasisPoints` is `NOT NULL` with `CHECK BETWEEN 0 AND 10000`. The migration inserts the singleton row with 1500, so the 15% default is seeded data that the Admin can change, not a constant in code and not a fallback in `QuoteBooking`. A rate of 0 is valid: VAT is 0 and the total equals taxable. The `PUT` schema accepts only an integer from 0 to 10000 and answers `422` with a field error for anything else (negative, above 100%, non integer, missing); the Admin cannot clear the value. There is no `vatConfigured` flag, no null amounts in the quote, no `VAT_NOT_CONFIGURED` reason, and no guard on the branch's online booking switch. Because the quote always has a rate, no total is ever missing. If the row is somehow absent, `QuoteBooking` fails closed with an internal error and does not assume a rate.

This amends Q-05, Q-45 wording ("online booking cannot be enabled until a rate is entered"), ADR 027, TX-1, FR-TAX-1, and FR-BR-3. The register row is updated now; the ADR, domain, and requirement text are reconciled in T3 and T4 under the owner's decision.

### Decision 4. Coupon policy and the redemption port

`CouponPolicy.validate(coupon | null, { branchId, phone?, now, redemptionsTotal, redemptionsForPhone })` returns `valid` or one reason in this fixed check order: `NOT_FOUND`, `INACTIVE`, `NOT_YET_VALID`, `EXPIRED`, `WRONG_BRANCH`, `LIMIT_REACHED`, `PHONE_LIMIT_REACHED` (CP-1, CP-7). The check order is a local choice because the docs list reasons without an order; it matters only when several reasons apply. `PHONE_LIMIT_REACHED` runs only when a verified `phone` is supplied (CP-7). Codes are trimmed and upper cased before lookup; the lookup uses the `upper(code)` unique index. `now` is `Clock.now()` (server time). Window rule: valid when `startsAt <= now < endsAt` (a local choice, matching the half open style of stays; `endsAt` itself is expired).

`CouponRedemptionReader` is a new application port returning `{ total, forPhone }`. M7's adapter returns zeros, the same pattern as M6's `EmptyReservationConsumptionReader`. M8 replaces it with a reader inside the booking transaction, with the `FOR UPDATE` coupon lock (CP-3), which M7 does not need because the quote does not reserve anything. A quote is advisory, never a guarantee; M8 re-validates. (Basis: ADR 027, ADR 016, CP-2, CP-3.)

Refusal messages: the same safe wording for every reason except the reason code in `context`; `WRONG_BRANCH` never says which branches a code is valid for. A code that exists only at another branch returns `WRONG_BRANCH` per the error model; an unknown code returns `NOT_FOUND`.

### Decision 5. Services

`ServiceKind { BREAKFAST AIRPORT_TRANSFER }`. A requested kind must have an active `ServiceOffering` at the quote's branch, otherwise `409 SERVICE_UNAVAILABLE` with `context.kind`. Duplicate kinds in one request are a `422`. Unrequested services are never added. The quote does not list unselected services (the cross sell offer is a UI concern for M10; P6 stays minimal). The unit, adult price, and child price come from the row, never from the request. Service pricing units were added by owner decision on 2026-11-11 (Q-49 amended, ADR 027 amended): per booking, per night, per person, and per person per night, with an optional child price for the person units only. Children are not charged when a person unit has no child price. These are staff settings, so no price, unit, or child rule is coded.

### Decision 6. Commercial settings storage

`CommercialSettings` is a singleton row with id `default`, matching the data model. The migration inserts the row with `vatRateBasisPoints = 1500` (15%, owner decision 2026-11-11), so reads never handle a missing row. The row is read and written through a `CommercialSettingsRepository` port; the update runs in an audited transaction that locks the row. The existing `SettingsRepository` (CMS site settings) is not extended, keeping the CMS and commercial rules separate.

### Decision 7. Migration `commercial_rules`

One additive migration, `..._commercial_rules`, with the models and SQL checks already designed in the data model (`ServiceOffering`, `Coupon`, `CouponBranch`, `CommercialSettings`, enums `ServiceKind` and the existing `CouponKind`):

| Entity | Rules |
| --- | --- |
| `ServiceOffering` | Unique `(branchId, kind)`; enum `ServicePriceUnit`, column `priceUnit` NOT NULL (no database default; staff choose it on first save); `priceMinor INTEGER CHECK > 0` (the adult price); `childPriceMinor INTEGER` nullable, CHECK `> 0`, and allowed only when `priceUnit` is `PER_PERSON` or `PER_PERSON_PER_NIGHT`; `active` defaults false so a new row is never offered before a price is confirmed; FK to `Branch` RESTRICT. |
| `Coupon` | Unique index on `upper(code)`; CHECK matching kind and value (percent 1 to 10000, fixed `> 0`, the other null); CHECK `endsAt > startsAt` when both exist; CHECKs `maxRedemptions >= 1` and `maxRedemptionsPerPhone >= 1` when present (a local sanity check, since zero would make a code unusable without being inactive); code printable allowlist and length enforced in the domain schema; audit columns. |
| `CouponBranch` | Composite PK `(couponId, branchId)`; FK Coupon CASCADE, Branch RESTRICT; a CHECK or trigger is not used for "allBranches excludes join rows", the domain schema and use case enforce it and an integration test proves it. |
| `CommercialSettings` | Singleton id `default`, inserted by the migration with `vatRateBasisPoints = 1500`; column `NOT NULL`, CHECK 0 to 10000; `updatedAt`, `updatedById`. |

Both composite style FKs use `ON UPDATE RESTRICT` as M6 did. Currency stays USD by convention and constant; no currency columns are added because ADR 027 and the data model sketch define money columns as `...Minor` integers and M6's CHECK style is kept via `priceMinor > 0` only. (Owner accepted the recommendation 2026-11-11: add `currency CHAR(3)` defaulting `USD` with `CHECK = 'USD'` on `ServiceOffering` and `Coupon`, matching ADR 020's explicit persisted currency, as M6's rate tables do. T3 reconciles the data model topic doc.)

The prisma schema allowlist test is updated to expect exactly these new models and still reject later milestone tables. The migration is rehearsed on a disposable copy of M6 data, with the drift check.

### Decision 8. Authorization

| Action | Capability and scope |
| --- | --- |
| Read services (S35) | `pricing:read`, `authorizeBranch` |
| Write service (S36) | `services:manage`, `authorizeBranch` (Manager assigned branches, Admin all) |
| List coupons (S37) | `coupons:manage`; Admin sees all; Manager sees only codes whose branch list is entirely within assigned branches, never `allBranches` codes (owner decision 2026-11-11; stricter than the contract's wording "valid at their branches", which T5 updates). |
| Create coupon (S38) | `coupons:manage`; Manager: `allBranches` false and every `branchIds` entry assigned, else `403`; Admin any |
| Patch coupon (S39) | Same rules, evaluated on the resulting state. A Manager cannot change a coupon that is not entirely within their branches (hidden as `404`). Code is immutable after creation (a local choice, since snapshots store the code and an edit would confuse guests and staff). |
| VAT read (A5 GET) | `pricing:read` |
| VAT write (A5 PUT) | `tax:manage` (Admin only), no branch scope |

All checks run inside the use case before any repository call. The branch always comes from the path or the server, never from a client value on a public route. (Basis: ADR 018, ADR 017.)

### Decision 9. Rate limit

A second public limiter rule, name `quote-coupon`, 20 requests per 10 minutes per client, using the existing `PublicRateLimitStore` and bucket cleanup job. It is consumed only for requests that include `couponCode`; a quote without a code is not limited by it (the brief limits coupon attempts). Quotes without a code fall under a general P6 limit, a local safety choice: reuse the availability rule shape, `quote`, 60 per minute per client, because P6 reads inventory like P5. Owner approved the general limit 2026-11-11. A denied request returns `429 RATE_LIMITED` with `Retry-After`. The limiter keys on the client identity the existing wrapper derives (`publicRoute`), with no personal data stored.

### Decision 10. Order of checks inside `QuoteBooking`

1. Validate the strict body (no extra keys, no money fields) and the stay with `validatePublicStay` and `localDateAt(clock.now(), branch.timeZone)`.
2. Resolve the active branch by slug (404 otherwise); resolve each `roomSlug` to a published listing of that branch; check occupancy per line (OC-2); at most 5 lines.
3. Read availability for the grouped quantities through the M6 reader (no lock, no hold). If any group is short, return `200 { available: false, unavailableLines, quote: null }` with the `unavailableLines` indexes. `ROOM_TYPE_NOT_BOOKABLE` (unpriced night, no units) is a per line unavailable reason, as in P5.
4. Resolve nightly prices with `NightlyPriceResolver` per line.
5. Load requested services (409 `SERVICE_UNAVAILABLE` on a missing or inactive one).
6. Validate the coupon if present (422 `COUPON_INVALID`), using the redemption port.
7. Read the VAT rate and call `QuoteCalculator`.
8. Return the breakdown. Nothing is written, locked, or cached. Rates and settings are read fresh.

Staff bookings reuse `QuoteBooking` in M8; M7 exposes only P6. `onlineBookingEnabled` is not required for a quote (Q-70) but is returned as `bookable: boolean` (branch switch on and quote available), so M10 can keep Book Now honest. No new business rule: it restates IN-4. (Basis: AV, OC, IN, PR, SV, CP, TX rules.)

### Value sourcing

| Value | Source |
| --- | --- |
| Branch id and time zone | Server, from `branchSlug` (active branches only) |
| Today for stay validation | `localDateAt(clock.now(), branch.timeZone)` |
| Listing, occupancy limits | Server catalog by `roomSlug` and branch |
| Nightly amounts | `NightlyPriceResolver` over base and periods (M6) |
| Service unit, adult and child price, active flag | `ServiceOffering` row, never the client |
| Guest counts for service quantities | Sum of `occupancy` over the validated lines |
| Coupon kind, value, window, scope, limits | `Coupon` row found by normalized code |
| Redemption counts | `CouponRedemptionReader` (zero until M8) |
| Phone for per phone limits | Optional request field, documented as a verified phone. M7 cannot verify it (phone verification is M8/M9 scope) and trusts it only to evaluate a limit that is always zero today; M8 re-validates with a consumed verification token. It is never stored or logged. |
| VAT rate | `CommercialSettings.vatRateBasisPoints` (seeded 1500, never null) |
| `now` for coupon windows | `Clock.now()` |
| Actor, audit before and after | Session principal, repository reads inside the audited transaction |

### Domain, application, and API layout

Domain: `src/domain/pricing/quote-calculator.ts`, `src/domain/shared/money.ts` (rounding helper), `src/domain/coupons/` (`coupon-policy.ts`, `coupon-code.ts`, `coupon-schema.ts`), `src/domain/services/` (`service-kind.ts`, schema). Application: `src/application/quotes/quote-booking.ts`, `src/application/services/manage-services.ts`, `src/application/coupons/manage-coupons.ts`, `src/application/settings/manage-commercial-settings.ts` (or `src/application/commercial/`), ports beside them. Infrastructure: SQL only under `src/infrastructure/db/prisma/repositories/reservations/commercial/` (nested like M6, to stay inside the dependency boundary). Composition: `src/composition/commercial.ts`. API: `src/app/api/v1/quotes/route.ts`, `staff/branches/[id]/services/...` (the segment is `[id]` because Next.js refuses two different dynamic names at one level and the M6 branch routes use `[id]`; owner accepted 2026-11-13), `staff/coupons/...`, `staff/settings/commercial/route.ts`, contracts in `src/contracts/api/v1/`, then `npm run openapi`.

New typed errors: `COUPON_INVALID`, `SERVICE_UNAVAILABLE` join the application error union and the single problem table (422, 409). `BRANCH_NOT_BOOKABLE` is not added in M7 (M8 uses it); P6 returns the flag instead. Audit actions added: `service.update`, `coupon.create`, `coupon.update`, `commercial.update` with the exact `changes` keys, no personal data.

### API surface

| Id | Method and path | Success | Key errors |
| --- | --- | --- | --- |
| P6 | `POST /api/v1/quotes` | `200 { available, unavailableLines, bookable, quote \| null }` (`quote` is null only when a line is unavailable), `Cache-Control: no-store` | 400/415 transport, 404 branch, 422 stay, occupancy, coupon, 409 `SERVICE_UNAVAILABLE`, 429 |
| S35 | `GET /staff/branches/{id}/services` | `{ items }` for both kinds, including kinds with no row (shown as inactive, no price) | 403, 404 |
| S36 | `PUT /staff/branches/{id}/services/{kind}` | `200`; body `{ priceUnit, price, childPrice?, active, description? }` | 403, 404, 422 (price `> 0` within `INTEGER`; `childPrice` only with `PER_PERSON` or `PER_PERSON_PER_NIGHT`) |
| S37 | `GET /staff/coupons?branchId&active&q&page` | `Paged<CouponDto>`, redemption counts are 0 until M8 | 403 |
| S38 | `POST /staff/coupons` | `201` plus `Location` | 403, 409 duplicate code (case insensitive), 422 |
| S39 | `PATCH /staff/coupons/{id}` | `200` | 403, 404, 409, 422 |
| A5 | `GET`, `PUT /staff/settings/commercial` | `200 { vatRateBasisPoints }` | 403, 422 (integer 0 to 10000; below 0, above 10000, or missing is refused) |

Staff mutations use the existing cookie session, CSRF, and capability checks. `PUT` of the same values succeeds and does not append a second audit event (no change). Idempotency keys and `If-Match` do not apply, as in M6.

### Edge cases

| Case | Behavior |
| --- | --- |
| Coupon code with mixed case or spaces | Trimmed, upper cased, matched |
| Coupon at exact `endsAt` | `EXPIRED` |
| Fixed coupon above subtotal | Discount equals subtotal, total 0 (example 4) |
| VAT rate 0 | Valid; VAT line is 0 |
| VAT rate below 0, above 100%, or missing on PUT | `422`, nothing changes |
| Concurrent coupon or settings edits | Row locked in the audited transaction so before and after audit values are coherent (no inventory lock) |
| Two services of the same kind in a request | `422` |
| Client sends `total`, `discount`, `vat`, `price` | `422` unknown key |
| Manager patches `allBranches` or adds an unassigned branch | `403` |
| Cross branch service or coupon write | `404` or `403` per existing helpers, nothing written |
| Rate limited coupon guessing | `429`, `Retry-After`, no information about the code |
| Unpriced night | Line unavailable with reason `UNPRICED`, no total invented |

### Test plan

Unit: T-QUOTE-1…10 (worked examples 1 to 4, rounding at exactly .5, zero services, several units, VAT 0 and 100%, coupon caps, no floats), T-CPN-1…5, T-SVC-1…2, T-TAX-1…2, `roundHalfUpDiv` property style table, authorization sweep additions. Integration on real PostgreSQL: T-CPN-6…8 (persistence, case insensitive uniqueness, branch scope, `allBranches` versus join rows), T-SVC-3…4, T-TAX-3…4, T-QUOTE-11…12 (P6 end to end for each worked example, with the rate limit), audit rows per change type, migration allowlist and drift check, seed test. Gates per task from `quality-gates.md`; no inventory locks are touched, so the 20 times concurrency repeat is not required, but a concurrent coupon edit test is included.

## Options considered

| Option | Benefit | Cost |
| --- | --- | --- |
| Pure `QuoteCalculator` plus `QuoteBooking` composing M6 readers, chosen | Exact arithmetic is testable without a database; M8 reuses both | Two layers to maintain |
| Compute totals in SQL | One query | Moves money rules out of the domain; harder to test; against the rules in AGENTS.md |
| Create `CouponRedemption` now | Real counts earlier | Pulls an M8 table into M7; breaks the binding out of scope list |
| Null VAT as 0% | Simplest | Shows a total that looks final with no tax; conflicts with Q-05 |

## Rationale

The money rules are few but legally sensitive, so they live in one pure function with the ADR's worked examples as tests. The server is the only authority, which is why strict schemas and an empty redemption port are enough for M7. Keeping redemptions and locks for M8 follows the brief's scope exactly while leaving the seam M8 needs. (Basis: ADRs 015, 016, 018, 020, 027; M6 spec 0003.)

## Consequences

- New tables `ServiceOffering`, `Coupon`, `CouponBranch`, `CommercialSettings`. No change to existing tables.
- Docs to update in step 7 of each task: `availability-and-pricing-rules.md`, `promotions.md`, `data-model.md`, `api-contracts.md`, `error-model.md`, `test-matrix.md`, `openapi`, the roadmap row, and the M7 report.
- M8 must: replace the empty redemption reader, lock the coupon row, and snapshot the quote including the VAT rate used.
- Because the VAT rate is never null, no booking path needs a VAT readiness check. `BRANCH_NOT_BOOKABLE` no longer has a `VAT_NOT_CONFIGURED` reason; the error model and FR-BR-3 are reconciled in T4.

## Build plan

Order follows the brief (domain first, then persistence, then use cases, then the public API last), with the approach of M6: thin vertical steps, each independently verifiable.

| Task | Satisfies | Summary |
| --- | --- | --- |
| M7-T1 | AC-1, AC-2 | `roundHalfUpDiv`, service price unit quantities, `QuoteCalculator`, worked example tests (examples 1 to 5) |
| M7-T2 | AC-3, AC-4 | `CouponPolicy`, coupon code normalization, service kinds, price unit schema and child price rule |
| M7-T3 | AC-4 | Migration `commercial_rules` (including `priceUnit` and `childPriceMinor`), demo seed, schema allowlist test, drift check |
| M7-T4 | AC-5, AC-7 | Services and VAT settings use cases and APIs S35, S36 (with unit and child price), A5, audit; VAT validation 0 to 10000 |
| M7-T5 | AC-5 | Coupon management use case and APIs S37 to S39 |
| M7-T6 | AC-1, 3, 4, 6 | `QuoteBooking`, API P6, rate limits (60 per minute general, 20 per 10 minutes with a code), end to end worked examples 1 to 5, service lines with unit and quantities in the response |

## Follow-up

- All earlier flags are resolved by the owner's answers of 2026-11-11. Reconciliation: ADR 027, TX-1, FR-TAX-1, FR-BR-3, and `error-model.md` carry no stale VAT gating text after T3 and T4; `api-contracts.md` A5, S35, and S36 are done (T4); only the S37 wording remains for T5.
- Spec 0005 (M8) must cite this one for the redemption reader and the quote snapshot.
- Reconcile `docs/database/data-model.md` and `docs/domain/promotions.md` in T3 and T5.

## References

None added. Sources are the ADRs and domain documents named above.
