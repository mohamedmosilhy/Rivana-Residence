# M12 — Manager and admin tools

Status: **Not started.** Scope extended by the owner on 2026-11-17: business insights in the reports (Q-89), the website traffic and booking funnel report (M12-T4b; ADR 029, Q-86…Q-88), and the transfer car settings (Q-82). Branch: `m12-manager-admin`. Follow the [milestone loop](./README.md#the-loop-every-milestone-follows).

## Objective

Commercial and administrative screens: prices, services, coupons, the VAT rate, reports, branch administration, staff roles and branch assignments, and the audit viewer.

## Read first

- [frontend/admin-dashboard.md](../../frontend/admin-dashboard.md), [frontend/booking-and-operations-ui.md](../../frontend/booking-and-operations-ui.md) (staff components)
- [requirements/functional-requirements.md](../../requirements/functional-requirements.md) (FR-PR, FR-SVC, FR-CPN, FR-TAX, FR-RPT, FR-ANL, FR-BR, FR-IAM, FR-AUD)
- [requirements/user-stories-and-acceptance-criteria.md](../../requirements/user-stories-and-acceptance-criteria.md) (US-M1…M3, US-M2a, US-M5, US-A1…A3, US-A5)
- [api/api-contracts.md](../../api/api-contracts.md) (S30–S43, S46, S47, A1–A5)
- [ADR 029](../../adr/029-first-party-site-analytics.md) (website analytics)

## Required audit repairs in M12

Keep F13 in M12. Its locked final administrator task is defined in [repairs/m12-manager-admin.md](./repairs/m12-manager-admin.md).

## Blocking questions

- Q-15 (CMS audit): recommendation (later) accepted unless answered.

## Skills for this milestone

| Step | Skill | Notes |
| --- | --- | --- |
| Spec | `/architect` (`FEATURE`) | Report definitions mapped to queries; screens list |
| Build | `/develop` (UI track; logic track for report queries S40–S42) | |
| Tests | `/test` | Report figures against a fixed fixture dataset |
| Failures | `/debug` | |
| Proof | `/check verify` | Compare report numbers with a hand calculation |
| Review | `/check review` | Focus: branch scope of reports and coupons, audit completeness |
| After merge | `/sync` | |

## In scope

`/admin/pricing`, `/admin/services`, `/admin/coupons`, VAT in `/admin/settings`, `/admin/reports` (reservations, insights, and website tabs), `/admin/branches` (full), staff role and branch assignment, `/admin/audit`.

## Out of scope (binding)

Broadcasts (M13). CSV export (Q-14). CMS audit (Q-15).

## Task breakdown

Planned, reviewed, and accepted one task at a time ([agent-workflow.md](../../engineering/agent-workflow.md)). Rows are confirmed at milestone open; the numbered **Tasks** below hold the detail. This table is provisional: re-confirm it against the code and decisions at milestone open.

| Task | Title | Risk | Depends on | Covers (criteria, tests) | Status |
| --- | --- | --- | --- | --- | --- |
| M12-T1 | Pricing screens | Medium | M8 | AC 1 | Not started |
| M12-T2 | Services and coupons screens (with `PER_VEHICLE` and max cars for the transfer) | Medium | M8 | AC 1 | Not started |
| M12-T3 | VAT setting (Admin only) | Medium | M8 | AC 1, 3 | Not started |
| M12-T4 | Reports: branch-scoped read models, API S40–S42 and S46 (insights, Q-89), screen | Critical | M9 | AC 2, 5 | Not started |
| M12-T4b | Website report: read model over `SiteDailyTotal` and today's `SiteEvent`, API S47, "Website" tab (visitors, sessions, funnel and drop-off, exit and landing pages, sources, devices, unmet demand, checkout refusals, verification abandonment, listing conversion, previous period) (Q-86…Q-89) | Critical | T4, M10-T0b | AC 6; T-RPT-7…10 | Not started |
| M12-T5 | Branches screen with the online-booking switch guard | Medium | M8 | AC 3 | Not started |
| M12-T6 | Staff role and branch assignment (last-Admin rule) | Critical | M8 | AC 1; E2E-A | Not started |
| M12-T7 | Audit screen | Medium | M8 | AC 4 | Not started |
| M12-T8 | WhatsApp settings screen polish | Low | M8 | AC 4 (axe) | Not started |

## Tasks

1. **Pricing** `/admin/pricing`: per listing base rate, date periods (no overlap; inline server errors), rate calendar (effective price per night).
2. **Services** `/admin/services`: per branch breakfast and airport transfer price unit (per car for the transfer, Q-82), adult price, optional child price (person units only), maximum cars for the transfer (default 3), on/off, description.
3. **Coupons** `/admin/coupons`: list with redemption counts, create and edit (code, percent or fixed, validity, limits, branches, active); Managers limited to their branches.
4. **VAT** in `/admin/settings` (Admin only, Q-05): the Admin types any rate in percent with up to two decimals (for example 5, 6, 15), stored as basis points; it starts at 15% and is never empty; values below 0 or above 100 are refused with an error; a warning that changes apply to new bookings only. Hidden from every other role.
5. **Reports** `/admin/reports` (API-S40–S42): reservations by status, source, and payment method; room-nights sold and available; occupancy; revenue excluding VAT; VAT; discounts; online payments captured and refunded; cancellations and requests; PMS-entry ages; each figure with its definition and limitations. **Insights** (API-S46, Q-89): RevPAR, booking pace, lead time, length of stay, arrival weekdays, cancellation lead time, no-show rate, payment mix and online payment success rate, coupon performance, service take-up and average cars, repeat guests, guest countries, changes.
6. **Branches** `/admin/branches`: create, edit, activate and deactivate, online booking switch (refused, with the reason shown, while no verification channel is ready (neither WhatsApp nor email, ADR 031), the check-in time is missing, or the branch has no published bookable listing), map, check-in and check-out times, sync settings.
7. **Staff** `/admin/staff`: role and branch assignment (API-A4); last-Admin rule.
8. **Audit** `/admin/audit` (S43): filters by branch, user, entity, date.
9. **WhatsApp settings** `/admin/settings/whatsapp` (from M8): polish the minimal screen into the final design; no new behavior.
10. **Website** tab of `/admin/reports` (M12-T4b, API-S47): the FR-ANL figures with their definitions and limitations (daily visitors, opt-outs not counted, bots filtered), a funnel chart with drop-off per step, exit pages, landing pages, sources, devices, unmet demand by date, listing conversion, compared with the previous period; Managers see their branches, Admins all and pages outside a branch (Q-88).

## Acceptance criteria

1. Managers change prices, services, and coupons only for their branches; VAT and branches are Admin-only; every change is audited with before and after values.
2. Report figures match the fixture dataset for every definition, and only include the caller's branches.
3. Turning online booking on is refused with a clear reason when neither WhatsApp nor email is ready; only the Admin sees the VAT setting.
4. E2E-M-1/2/4 and E2E-A-1…4 pass; axe clean.
5. Every insight figure matches the fixture dataset by its definition and includes only the caller's branches (Q-89).
6. Website figures match a fixture of events and daily totals (visitors, sessions, every funnel step, drop-off, exit pages, unmet demand); a Manager never sees another branch or pages outside a branch; no figure identifies a visitor (Q-86…Q-88).

## Tests

T-RPT-1…10, E2E-M-1, E2E-M-2, E2E-M-4, E2E-A-1…4.

## Evidence for the report

Screenshots; the fixture calculation next to the report output.

## Risks

- Report definitions misread: each figure states its definition on screen.

## Handoff

Close the milestone ([README steps 8–15](./README.md#the-loop-every-milestone-follows)), report, then stop. M13 has not started.
