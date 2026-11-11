# M7: Booking quote (services, coupons, VAT)

Status: **In progress (1/6 tasks accepted).** Brief: [m7-booking-quote.md](../milestones/m7-booking-quote.md). Spec: [0004](../../specs/0004-m7-booking-quote.md), approved by the owner on 2026-11-11.

Branch: `m7-booking-quote`.

## Owner decisions at open (2026-11-11)

- VAT rate is never null: it starts at 15% (1500 basis points, seeded data), the Admin can set 0% to 100%, and a value below 0 or above 100 is refused. Online booking is no longer gated on a VAT rate (Q-05 amended).
- Service prices use a configurable unit per branch and service: per booking, per night, per person, or per person per night, with an optional child price for the person units (Q-49 amended, ADR 027 amended). The client still answers which unit, prices, and child charging each branch uses (Q-56).
- Managers see and edit only coupons whose branches are all within their assignment. P6 has a general limit of 60 requests per minute per client, and 20 coupon attempts per 10 minutes.

## Task log

| Task | Risk | Accepted | Commit | Review file | Gates (counts) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| M7-T1 | Critical | Owner, 2026-11-11 | `feat(pricing): add M7-T1 quote arithmetic and service price units` (this task commit) | [2026-11-11-m7-t1.md](../../reviews/2026-11-11-m7-t1.md) | `npm run check` passed: format, lint, typecheck, 70 unit files / 1,454 tests, build. Integration and end to end not run: no database, route, or lock in this task | `roundHalfUpDiv`, service price unit quantities, `QuoteCalculator`; worked examples 1 to 5 to the cent. Review (Opus) found 1 major (service line shape) and 6 minors, all fixed or recorded. Later docs still saying "flat price" or "VAT unset" (M10 and M12 briefs, frontend doc, learning notes) are reconciled with those milestones; the M5 branch switch message in `src/domain/branches/branch.ts` is reworded with the task that enables the switch |

Task commits identified by subject in this log can be located with `git log --oneline --fixed-strings --grep='<subject>'`.
