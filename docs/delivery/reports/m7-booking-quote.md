# M7: Booking quote (services, coupons, VAT)

Status: **Accepted by the owner (2026-11-13): 6/6 tasks accepted, milestone close gates and runtime verification complete.** Brief: [m7-booking-quote.md](../milestones/m7-booking-quote.md). Spec: [0004](../../specs/0004-m7-booking-quote.md), approved by the owner on 2026-11-11.

Branch: `m7-booking-quote`.

## Owner decisions at open (2026-11-11)

- VAT rate is never null: it starts at 15% (1500 basis points, seeded data), the Admin can set 0% to 100%, and a value below 0 or above 100 is refused. Online booking is no longer gated on a VAT rate (Q-05 amended).
- Service prices use a configurable unit per branch and service: per booking, per night, per person, or per person per night, with an optional child price for the person units (Q-49 amended, ADR 027 amended). The client still answers which unit, prices, and child charging each branch uses (Q-56).
- Managers see and edit only coupons whose branches are all within their assignment. P6 has a general limit of 60 requests per minute per client, and 20 coupon attempts per 10 minutes.

## Task log

| Task | Risk | Accepted | Commit | Review file | Gates (counts) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| M7-T1 | Critical | Owner, 2026-11-11 | `feat(pricing): add M7-T1 quote arithmetic and service price units` (this task commit) | [2026-11-11-m7-t1.md](../../reviews/2026-11-11-m7-t1.md) | `npm run check` passed: format, lint, typecheck, 70 unit files / 1,454 tests, build. Integration and end to end not run: no database, route, or lock in this task | `roundHalfUpDiv`, service price unit quantities, `QuoteCalculator`; worked examples 1 to 5 to the cent. Review (Opus) found 1 major (service line shape) and 6 minors, all fixed or recorded. Later docs still saying "flat price" or "VAT unset" (M10 and M12 briefs, frontend doc, learning notes) are reconciled with those milestones; the M5 branch switch message in `src/domain/branches/branch.ts` is reworded with the task that enables the switch |
| M7-T2 | Critical | Owner, 2026-11-11 | `feat(domain): add M7-T2 coupon and service rules` (this task commit) | [2026-11-11-m7-t2.md](../../reviews/2026-11-11-m7-t2.md) | `npm run check` passed: format, lint, typecheck, 73 unit files / 1,568 tests, build. Integration and end to end not run: no database, route, or lock in this task | `CouponPolicy` (fixed refusal order, start inclusive and end exclusive window, per phone limit only with a phone, fails closed on corrupt input), `normalizeCouponCode` (letters, digits, `-`, `_`, 3 to 32), service offering input with the child price rule, `selectRequestedServices`. Review (Opus): approve with nits; the 3 minors and 5 nits fixed, 2 nits left (description rule duplicates `optionalText`; the no-mutation test cannot detect a `Date` change). Coupon authoring schemas moved to T5. Also committed: owner decision for re-pricing per night services on stay changes (PR-11, M8 brief) |
| M7-T3 | Critical | Owner, 2026-11-11 | `feat(db): add M7-T3 commercial rules and demo seed` (this task commit) | [2026-11-11-m7-t3.md](../../reviews/2026-11-11-m7-t3.md) | `npm run check` passed: format, lint, typecheck, 73 unit files / 1,568 tests, build. Full PostgreSQL integration: 32 files / 454 tests. Reviewer focused integration: 5 files / 53 tests. Fresh and upgraded schema drift: no difference | Four commercial tables, three enums, SQL money and scope-reference constraints, case-insensitive coupon uniqueness, singleton VAT seeded at 1500, and create-only fictional demo services/coupons. Populated M6 rehearsal preserved every existing row. Real demo CLI ran twice; changed prices, inactive services/coupons, and VAT 0% were preserved exactly. Review by gpt-6-astra: Approve, zero findings. No routes or lock workflows changed, so E2E and an additional concurrency repeat were not required. Documentation synchronized after acceptance; T4 not started |
| M7-T4 | Critical | Owner, 2026-11-13 | `feat(commercial): add M7-T4 services and VAT settings API` (this task commit) | [2026-11-13-m7-t4.md](../../reviews/2026-11-13-m7-t4.md) | `npm run check` passed: format, lint, typecheck, 77 unit files / 1,624 tests, build. Full PostgreSQL integration: 33 files / 478 tests, including 24 in `commercial.test.ts` (3 observed lock wait races × 20 iterations for services and 1 for VAT, `TRY_AGAIN` at 5 seconds for both rows, rollback on audit failure). Dev server: signed out calls to the new routes return 401. `npm run openapi` regenerated | `ManageServices` (S35, S36), `ManageCommercialSettings` (A5), VAT parser (integer 0 to 10000, never null), audit actions `service.update` and `commercial.update`, insert then lock upsert with the timestamp read after the lock. Review (Opus): changes requested, one major (races without a barrier) and three minors fixed before acceptance; nits left: OpenAPI `{kind}` is not an enum, audit snapshot types are `string`, `money()` hardcodes USD. Route folder is `[id]`, not the spec's `[branchId]`, because Next.js refuses two names at one level (owner accepted); `route-segments.test.ts` guards it. S35 returns null fields for a kind with no offering and S36 returns the stored offering; `api-contracts.md` changed to match (owner decision). Removing `FOR UPDATE` from the services repository does not fail the races: `ON CONFLICT DO NOTHING` already waits on the conflicting row, so the lock is defense in depth. T5 not started |

| M7-T5 | Critical | Owner, 2026-11-13 | `feat(coupons): add M7-T5 audited coupon management API` (this task commit) | [2026-11-13-m7-t5.md](../../reviews/2026-11-13-m7-t5.md) | `npm run check` passed: format, lint, typecheck, 79 unit files / 1,680 tests, build. Full PostgreSQL integration: 34 files / 506 tests. Chromium E2E: 178 passed / 30 intentional skips. Focused coupon and inventory concurrency: 2 files / 42 tests, with races repeated 20 times. Reviewer independently reran 4 unit files / 200 tests and 1 coupon integration file / 28 tests. OpenAPI regenerated; `git diff --check` passed. After documentation sync: format check and 2 architecture files / 16 tests passed | `ManageCoupons` (S37–S39), immutable normalized codes, strict authoring and merged PATCH validation, entire-scope Manager visibility before pagination/counting, parent row lock with 5-second timeout, atomic branch joins and before/after audit, rollback and no-op handling. Real-session desktop/mobile API proof. Review by gpt-6-astra: Approve; one reproduced list snapshot isolation blocker fixed with single-statement scope filtering and branch hydration, retained failing-before/passing-after regression, no unresolved findings. No migration or new dependencies; redemption counts remain zero until M8. T6 not started |
| M7-T6 | Critical | Owner, 2026-11-13 | `feat(quotes): add M7-T6 QuoteBooking and public quote API` (this task commit) | [2026-11-13-m7-t6.md](../../reviews/2026-11-13-m7-t6.md) | `npm run check` passed: format, lint (no warnings), typecheck, 80 unit files / 1,728 tests, build. Full PostgreSQL integration: 35 files / 534 tests, including `quotes.test.ts` (worked examples 1 to 5 to the cent through the real handler, 27 plus cases, both limits, parallel admission 20 of 30). Playwright: 179 passed, 30 skipped, with the P6 $391 example attached as evidence. Real dev server (disposable E2E database): 422, 415, 400, then 20 coupon attempts and 429 with `Retry-After: 600` | `QuoteBooking` (reads only), P6, typed `COUPON_INVALID` (422) and `SERVICE_UNAVAILABLE` (409), `CouponLookup` and a zero `CouponRedemptionReader`, `rateLimitAfterBody` on `publicRoute`, limits `quote` 60 per minute and `quote-coupon` 20 per 10 minutes (a coupon request takes both, owner confirmed), cleanup of all public namespaces. Review (Opus): changes requested, one major (check order untested) and four minors fixed before acceptance; nits and two items left open (see Known limitations). `docs/api/api-contracts.md` Quote type rewritten to what was built. Milestone close not started |

Task commits identified by subject in this log can be located with `git log --oneline --fixed-strings --grep='<subject>'`.

## Outcome

M7 delivers one server side quote that composes accommodation (one to five units), requested services, an optional coupon, and VAT exactly as ADR 027 defines, behind the public API `POST /api/v1/quotes` (P6), plus the staff APIs to manage services (S35, S36), coupons (S37 to S39), and the VAT rate (A5). The client never sends a price. Nothing is stored, locked, or cached by a quote. Reservations, redemptions, and payment are M8 and M9.

## Scope delivered

- [x] `roundHalfUpDiv`, service price units, `QuoteCalculator` (M7-T1)
- [x] `CouponPolicy`, coupon codes, service kinds and offering rules (M7-T2)
- [x] Migration `commercial_rules` and fictional demo seed (M7-T3)
- [x] Services and VAT settings, audited, S35, S36, A5 (M7-T4)
- [x] Coupon management, branch scoped and audited, S37 to S39 (M7-T5)
- [x] `QuoteBooking` and API P6 with both rate limits, typed `COUPON_INVALID` and `SERVICE_UNAVAILABLE` (M7-T6)
- Out of scope and not done, as the brief requires: stored reservations, redemptions, service lines (M8), payment (M9), Admin and Manager screens (M12), marketing messages (M13), any currency other than USD.

## Files added, changed, removed

8 commits on `m7-booking-quote` (`git log main..HEAD`): 134 files, +11,786 and -339 lines against `main`. 68 files are new and 66 changed; none removed. By layer: domain (`pricing`, `coupons`, `services`, `settings`, `audit`), application (`quotes`, `coupons`, `services`, `commercial`, shared limiter and error code files), infrastructure (the commercial repositories and the public limiter store), composition, contracts and `openapi.json`, Route Handlers, tests, and docs. The commit `d052a34` also adds the M8-T0 task card to the M8 brief (owner decision).

## Migrations and configuration

- One migration, `20261111120000_commercial_rules` (additive; tables `ServiceOffering`, `Coupon`, `CouponBranch`, `CommercialSettings`; three enums; money and scope CHECKs; the settings row inserted at 1500). Fresh and upgraded schema drift: no difference (rerun at close, below).
- No new dependencies and **no new environment variables**. Operators should run `npm run db:migrate` or `db:deploy` before using the quote API (the local `rivana` development database has not had this migration applied yet).
- The hourly `npm run throttles -- cleanup-public` job now also prunes the `quote` and `quote-coupon` buckets (documented in the deployment guide).

## Decisions made during the milestone (local choices only; business questions raised)

- A coupon request takes both limits, the general `quote` (60 per minute) and `quote-coupon` (20 per 10 minutes); the owner confirmed the stricter reading on 2026-11-13.
- Redemption counts are read through a port with a zero adapter until M8.
- The quote response carries a small room summary, not the listing card. Internal ids, period ids, and rate sources never leave the API.
- The Route Handler segment for the services API is `[id]` (Next.js refuses two names at one level).
- No new business question was raised. Two owner notes were carried to M8 (verified phone for coupon limits, a slim public listing reader); see Known limitations.

## Commands and results (exact commands, counts, durations)

All run on the final tree on 2026-11-13 (macOS, Node 26.13.0, PostgreSQL 17 via Postgres.app).

| Gate | Command | Result |
| --- | --- | --- |
| Aggregate | `npm run check` | **Pass** in 26 s: format, lint (no warnings), typecheck, **80 unit files / 1,728 tests**, production build |
| Integration | `TEST_DATABASE_URL=postgresql://<user>@127.0.0.1:5432/rivana_test npm run test:integration` | **Pass** in 143 s: **35 files / 534 tests** |
| Concurrency | `vitest run --config vitest.integration.config.ts tests/integration/reservations/concurrency.test.ts` | **Pass**: 1 file / 14 tests (races repeat 20 times inside the suite). M7 takes no inventory lock; run because the loop asks for it |
| E2E | `E2E_DATABASE_URL=postgresql://<user>@127.0.0.1:5432/rivana_e2e_test npm run test:e2e` | **Pass** in 75 s: Chromium **179 passed, 30 intentional skips**, includes the P6 $391 example |
| Migration drift | `prisma migrate deploy` on a scratch database, then `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | 8 migrations applied; **No difference detected** |
| OpenAPI | covered by the unit freshness test and `npm run openapi` | no drift |
| WebKit and Lighthouse | not run | no UI or public page changes in M7 |

## Acceptance criteria → evidence (one row per criterion)

Runtime verification (`/check verify`): the real Next.js dev server against the disposable `rivana_e2e_test` database, staff sessions through the real admin login (Admin, Manager, Receptionist), API calls from the signed in page, database state by SQL. 43 recorded behaviours: 42 passed with evidence, 1 not exercised live (see AC-4). Full ledger: [m7-verification.json](./m7-verification.json). Responses of the worked examples: [m7-worked-examples.json](./m7-worked-examples.json). Audit rows: [m7-audit-rows.json](./m7-audit-rows.json).

| AC | Verdict | Evidence |
| --- | --- | --- |
| 1. Worked examples reproduce to the cent through `QuoteCalculator` and API-P6 | Met | Through the running API: example 1 = 26000 (29900 with VAT), example 2 = 64026 (60000 / 5500 / 65500 / discount 9825 / taxable 55675 / VAT 8351), example 4 total 0, example 5 = 39100 (breakfast 7500: 6 adult and 3 child quantities). Also the integration suite and the unit tests |
| 2. VAT once on taxable, half up; percent coupon once on subtotal; fixed coupon capped | Met | Example 3: taxable 10010 gives VAT 1502, total 11512; 10% of 33333 gives 3333; example 4: fixed 5000 against subtotal 4000 gives discount 4000, taxable 0, VAT 0 |
| 3. Services only when requested; inactive gives `SERVICE_UNAVAILABLE` | Met | Both services active and none requested: no service lines, total 0; inactive transfer: `409 SERVICE_UNAVAILABLE`, `context.kind = AIRPORT_TRANSFER` |
| 4. Each coupon refusal is `422 COUPON_INVALID` with `context.reason`, case insensitive | Met for 5 of 7 reasons live; 2 by tests only | Live: `NOT_FOUND`, `INACTIVE`, `NOT_YET_VALID`, `EXPIRED`, `WRONG_BRANCH`, one identical message for all, `fieldErrors.couponCode`; `" v7SaVe15 "` matched `V7SAVE15`. **`LIMIT_REACHED` and `PHONE_LIMIT_REACHED` cannot be reached through the API in M7** because redemption counts are zero until M8 (spec 0004 Decision 4); they are proven by `coupon-policy.test.ts` and `quote-booking.test.ts` only. M8 must prove them live |
| 5. Manager creates coupons only for assigned branches and changes service prices only there; VAT Admin only; every change audited | Met | Manager: coupon for new-cairo `201`, all-branches coupon `403`, coupon for demo-giza `403`; service price new-cairo `200`, demo-giza `403`. Receptionist: read `200`, write `403`. VAT: Manager `403` to change, `200` to read. Audit rows by action: `service.update` 7, `coupon.create` 8, `commercial.update` 3, all STAFF actors with before and after (the service description text is never copied) |
| 6. The quote never trusts a client price, discount, or tax value | Met | `total`, `discount`, `vatRateBasisPoints`, and a price on a line each returned `422 VALIDATION` with no quote |
| 7. VAT never null: starts at 15%, Admin sets 0 to 100%, below 0, above 100, or non integer refused | Met | Row starts at 1500 (SQL and GET); `-1`, `10001`, `14.5`, `null`, `"15"`, and a missing key each `422` with the stored rate unchanged; 0% gives VAT 0, 100% gives VAT = taxable; audit chain 1500 to 0 to 10000 to 1500, and repeating the same value added no row |

Evidence the brief asks for: the worked examples' API responses (file above); audit rows for each change type (`service.update`, `coupon.create`, `commercial.update`, file above; `coupon.update` is covered by `coupons.test.ts` and `coupons-api.spec.ts`); the rate limit responses: the 61st code free quote in a minute returned `429 RATE_LIMITED` with `Retry-After: 60`, the 21st coupon attempt in 10 minutes returned `429` with `Retry-After: 600` while a code free quote still returned 200, and the limiter keys are `rl:quote:` and `rl:quote-coupon:` followed by a 43 character hash (no code, no phone).

Other specced surfaces confirmed live: the four tables and the seeded 1500 row, the cleanup job (`{"deleted":3}`, no quote bucket left), and the demo seed (fictional breakfast and transfer for the demo branch only, `DEMO_PERCENT`, `DEMO_FIXED`, VAT preserved; a live demo quote gave 24840 and 25875, both checked by hand).

## Screenshots (UI milestones; desktop 1280 and mobile 390)

Not applicable: M7 has no UI. Admin and Manager screens are M12.

## Known limitations, risks, deferred work

- **Heavier room lookup in P6.** `QuoteBooking` reads the full published room graph (`RoomRepository.listPublished`) only to resolve slug, name, type, and occupancy limits. The lighter `AvailabilityCatalog` has no slug or type. A slim public listing reader, shared with P5, is scheduled in the M8 brief ([Carried over from M7](../milestones/m8-reservations.md#carried-over-from-m7-owner-notes-2026-11-13)).
- **Phone enumeration risk once redemptions exist (M8).** `phone` is unverified. M8 must honour the per phone coupon limit only for a verified phone, or stop returning `PHONE_LIMIT_REACHED` publicly. Tracked in the same M8 section.
- **Shared limiter bucket without trusted proxy headers.** Documented in the deployment and security docs.
- **Redemption counts are zero** until M8 persists redemptions (spec).
- **Dev database.** The local `rivana` database does not have the `commercial_rules` migration; run `npm run db:migrate` before trying P6 locally.

## Next milestone: not started

M8 (reservations) has not started. Its first task is M8-T0 (application ports consolidation), then M8-T0b, and the owner notes above are in the M8 brief under "Carried over from M7".
