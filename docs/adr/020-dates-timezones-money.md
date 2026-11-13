# ADR 020 — Date-only stays, branch time zones, and integer US-dollar money

Status: **Accepted** (2026-10-24). **Amended by [ADR 027](./027-booking-price-composition.md) (2026-11-06):** VAT, coupons, and services enter the price composition, with basis-point percentages rounded half-up once per amount. The VAT rate starts at 15% and the Admin may set 0% to 100% (Q-05, amended 2026-11-11). Dates, time zones, and integer US-dollar money below are unchanged.

## Context

Stays are calendar nights, not instants. Cairo observes daylight saving time. The codebase stores timestamps as UTC `timestamptz`, every Prisma connection runs with `-c TimeZone=UTC`, and `src/domain/shared/zoned-time.ts` converts wall-clock values. Prices are quoted in US dollars (owner decision, 2026-10-24; the scope PDF used EGP examples).

## Problem

How are stay dates, "today", nights, and money represented so that boundaries and totals are exact?

## Decision

**Dates**

- Stay dates are date-only values: a domain `LocalDate` value object (`YYYY-MM-DD`), stored as PostgreSQL `DATE`. JavaScript `Date` is never used for a stay date in domain or application code. At the Prisma boundary, `DATE` columns are mapped to and from `LocalDate` at UTC midnight, which the UTC session makes exact.
- A stay is the half-open range `[checkIn, checkOut)`: check-in inclusive, check-out exclusive. October 10 → October 12 occupies the nights of the 10th and 11th, and another stay may start on the 12th.
- `checkOut > checkIn`. Maximum stay and booking horizon are configurable (proposed defaults: 30 nights, 540 days ahead; Q-09).
- "Today" for a branch is computed in that branch's IANA time zone (`Branch.timeZone`, default `Africa/Cairo`) from an injected `Clock`. Public check-in cannot be before the branch's today. A same-day cut-off time is Q-09.
- Audit and status timestamps remain UTC instants, displayed in the branch time zone.

**Money**

- Amounts are integers in minor units (cents: 1 USD = 100), stored as `INTEGER`, with an explicit `currency` column (`USD`). There is no floating-point arithmetic.
- Nightly prices are absolute amounts. Totals are sums, so there is no division and no rounding in v1. If percentage-based rules are ever approved, they round half-up to the minor unit per night, and that rule will be tested.
- Prices are displayed as entered. Whether they include VAT, service charge, or city tax is unknown (Q-05). Until it is answered the UI shows a neutral, client-approved note, and the domain contains **no tax or fee logic**.
- Each reservation stores a per-night price snapshot. Later rate changes never alter it.

## Options considered

- `timestamptz` check-in instants: invites off-by-one-day errors across DST and zones. Rejected.
- `Decimal`/`NUMERIC` money: workable, but integer minor units are simpler and exact for USD. Rejected for v1.

## Consequences

- One `StayRange` value object (nights iteration, overlap, length) is the single source for date logic. It is unit-tested for adjacency, overlap, month and year boundaries, leap days (2028-02-29), DST transition dates, and invalid ranges.
- The quote API returns integer minor units plus `currency`; formatting happens in presentation.

## Risks

- Tax-inclusive versus tax-exclusive display mistakes have legal weight. Mitigation: no tax text until the client answers Q-05.
