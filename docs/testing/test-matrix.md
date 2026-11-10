# Test matrix

Planned tests for branch websites, reservations, payments, and messaging, by layer, with the ids used in the [traceability matrix](../requirements/scope-traceability-matrix.md) and the [milestone briefs](../delivery/milestones/README.md). Revised 2026-11-06 for the client decisions (Q-36…Q-53). Existing website and CMS tests are described in [testing-strategy.md](./testing-strategy.md) and live under `tests/`; the promotion popup tests are deleted in M5 with the popup.

## Implemented so far

M4 (2026-11-06), M5 (2026-11-07), and accepted tasks M6-T1 through M6-T10 (latest 2026-11-10) implemented the coverage listed here; everything else below is still planned.

| Id | Where |
| --- | --- |
| T-DATE-1…8 (M6-T1) | `tests/unit/domain/local-date.test.ts`, `stay-range.test.ts`, `stay-policy.test.ts`, and `tests/unit/content/zoned-time.test.ts`: strict dates, leap and century rules, night iteration, adjacency and overlap, positive ranges, 30/31-night and 540/541-day boundaries, configurable public policy, explicit branch today and Cairo DST |
| Occupancy and money foundation (M6-T1) | `tests/unit/domain/occupancy.test.ts` and `money.test.ts`: safe integer counts, per-unit eligibility, USD cents, zero, checked addition and multiplication, overflow, and immutable values. Full quote composition remains planned |
| T-AV-1…6, domain reduction cases (M6-T2) | `tests/unit/domain/availability-calculator.test.ts` and `inventory-reduction.test.ts`: nightly quantity checks, missing and oversold inventory, invalid counts, chronological failures, block and assignment overlap, replacement, inactive and already blocked units, explicit deactivation dates, and sparse long ranges. Empty stays are rejected by T1's `StayRange`. No database concurrency proof is claimed |
| Applicable T-PR-1…6 (M6-T2) | `tests/unit/domain/nightly-price-resolver.test.ts`: base fallback, active period boundaries and overlap rejection, inactive periods, unpriced gaps, the 26000-cent worked example, quantity multiplication, checked overflow, and immutable resolved values. Persisted reservation snapshot immutability and manual override authorization remain M8 tests |
| Inventory schema foundation (M6-T3) | `tests/integration/inventory-constraints.test.ts`, schema, seed, and migration suites: range and amount checks, GiST overlap exclusions, adjacency, inactive or cancelled rows, ownership, delete restrictions, migration rehearsal, drift, and safe repeated demo seeding |
| Inventory transaction foundation (M6-T4) | `tests/unit/application/inventory-guard.test.ts` and `tests/integration/reservations/{unit-of-work,inventory-reader}.test.ts`: guard ordering and refusal, same connection and `READ COMMITTED`, rollback of mutation and audit, hidden foreign listings, complete zero capacity nights, sparse consumption validation, and real five second timeout mapping |
| Physical units (M6-T5) | `tests/unit/application/manage-physical-rooms.test.ts` (T-AUTHZ-2 role and branch sweep with zero port calls on refusal, validation, blank note normalization, patch paths, no-op, guarded deactivation with sparse future sold nights, assignments, blocks, audit redaction); `tests/integration/reservations/physical-rooms.test.ts` (T-AUD-1 rollback on audit failure, T-HTTP for S21 to S23 including `Location`, hidden cross branch 404, `409` label field error, `503` with `Retry-After: 5` and safe body for listing and unit row locks); `tests/e2e/physical-rooms-api.spec.ts` (Chromium REST, CSRF, role and branch restrictions). Sold inventory is injected through the consumption port, so these prove the guard's reduction logic, not real reservation consumption (M8). |
| Blocks (M6-T6) | `tests/unit/application/manage-blocks.test.ts` (authorization sweep with zero port calls on refusal, 62 night window, validation, sold overflow naming the night, sparse consumption, assignments, overlap and adjacency, extension replaces the old range, cancelled blocks, idempotent cancel, audit redaction, lock order); `tests/integration/reservations/blocks.test.ts` (repository, `23P01` mapping, row lock timeout, T-HTTP for S24 to S27, audit rollback, hidden cross branch 404); `tests/integration/reservations/concurrency.test.ts` (20 iterations each: block versus block, adjacent blocks, extension versus new block, extension versus cancellation, block versus deactivation, both reduction entry points waiting behind a held listing lock, activation versus deactivation, branch isolation C-8); `tests/e2e/blocks-api.spec.ts` (Chromium REST, CSRF, roles). Sold inventory is injected, so these prove guard logic, not real reservation consumption (M8). |
| Rates (M6-T7) | `tests/unit/domain/rate-authoring.test.ts`; `tests/unit/application/manage-rates.test.ts` (authorization sweep over all five operations with zero port calls on refusal, hidden ids, no op writes, audit payloads, calendar); `tests/integration/reservations/rates.test.ts` (worked calendar, `23P01` and `40P01` mapping, S32 and period row lock timeouts to 503, audit rollback per mutation, T-HTTP for S30 to S34, hidden cross branch 404, five races × 20 iterations with observed lock waits); `tests/e2e/rates-api.spec.ts` (roles, branch scope, CSRF, strict bodies, 204) |
| Availability (M6-T8) | `tests/unit/domain/availability-search.test.ts`; `tests/unit/application/availability.test.ts` (grid authorization sweep with zero port calls on refusal, 62 night window and 422s, every status listing and every night, zero unit listing, oversold integrity failure, search stay policy in the branch zone, worked example $260.00, quantity cap of 5 and clamp at zero, refusal precedence, total times quantity, no partial price array, occupancy with free units, field allowlist, deleted listing retry); `tests/integration/reservations/availability.test.ts` (S20 through the real Route Handler on PostgreSQL: statuses and order, blocks, branch isolation, 400 versus 422, roles; search over real repositories; one rate query pair for many listings); `tests/e2e/availability-api.spec.ts` (Chromium REST: grid shape, no-store, a block lowering capacity, 400 versus 422, roles, branch scope). Sold inventory is empty, so this proves read arithmetic, not real reservation consumption (M8). |
| Public limiter readiness (M6-T9, AC-8 and T-HTTP) | `tests/unit/application/public-rate-limit.test.ts` (60/61, expiry, rounded retry, lock retention, anonymous fallback, failure propagation, cleanup clock); `tests/unit/composition/public-client-address.test.ts` (trusted forwarding and spoof refusal); `tests/integration/public-rate-limit.test.ts` (real PostgreSQL and HTTP wrapper: quantity boundary, branch and namespace isolation, HMAC storage, 80 concurrent requests admitting exactly 60, bounded cleanup preserving staff rows and active windows/locks, both admission/cleanup race orderings, time sampled after lock acquisition, and real operator CLI). Burst and both cleanup races repeat 20 times on independent clients. Existing unit and integration staff sign-in suites passed unchanged. P5 route coverage remains T10. |
| Public availability API (M6-T10, AC-1, AC-6, AC-8, T-HTTP) | `tests/unit/api/public-availability.test.ts` (transport conversion and blank numeric refusal, missing/unknown/duplicate parameters, strict public response); `tests/integration/reservations/public-availability.test.ts` (34 cases through the real handler: $260 worked example, quantity defaults/multiplication/cap, unavailable precedence, zero capacity, branch/publication isolation, fresh prices/blocks/catalog/branch status, 400/422, Cairo today, stay limits, 60 admissions from 70 concurrent requests, disappearing summaries, error propagation, and fresh/repeated demo seeds); final serial test in `tests/e2e/branch-websites.spec.ts` (live P5 worked example, quantity, 400/422, fresh rate/unit/branch changes). The [captured response](../delivery/reports/m6-t10-worked-example.json) records the future four-night 26000-cent result. |
| Inventory lock harness (M6-T4) | `tests/integration/reservations/concurrency.test.ts`: 20 iterations each for reversed multi listing lock order, observable same listing wait with a fresh committed read, and independent branch locking; M6-T5 adds 20 iteration cases for competing deactivations (nonnegative capacity), deactivation waiting behind the listing lock and reloading fresh state, and matching labels across branches |
| T-AUTHZ-1 | `tests/unit/auth/authorization.test.ts` (four roles × every capability), `authorize-branch.test.ts`, and the sweep extended to Receptionist and Manager in `authorization-sweep.test.ts` |
| T-ARCH-1…4 | `tests/unit/architecture/module-boundaries.test.ts` (D-7, D-8, D-11), `persistence-boundaries.test.ts` (D-9, D-12), `route-handlers.test.ts` (D-10), `openapi.test.ts` (freshness) |
| T-HTTP-1…6 | `tests/unit/api/http-layer.test.ts` (415, 413 declared and streamed, 400, 422, 403 cross-site, 401; webhook raw body; 500 without leakage; log redaction); `tests/integration/health-route.test.ts` |
| T-DB-1, T-DB-2 | `tests/integration/branches-migration.test.ts` (M3 data → M4 migrations, no drift), `branches.test.ts` (per-branch keys and order, branch checks) |
| T-AUD-1 | `tests/integration/branches.test.ts` (rollback leaves no row); CLI audit rows in `staff-branches.test.ts` |
| T-SITE-7 (reserved slugs) | `tests/unit/domain/branches-audit.test.ts`, plus the `Branch_slug_check` constraint in `branches.test.ts` |
| E2E-A-2 (first part) | `tests/e2e/branch-roles.spec.ts` (Receptionist and Manager: staff home, denied CMS routes including `/admin/branches`, refused CMS action) |
| T-SITE-1, T-SITE-2 (M5) | `tests/integration/public-site.test.ts` "branch isolation" (listings, facilities, flags, inactive branch hidden, map re-check) |
| T-SITE-3 (M5) | `tests/integration/branch-api.test.ts` (API-A2 seeds three unpublished pages and an audit row), `branches.test.ts` (atomic creation rolls back) |
| T-SITE-4 (M5) | `tests/unit/domain/branch-websites.test.ts` (ManageBranches tag sets), `tests/unit/content/catalog-commands.test.ts`, `page-commands.test.ts`, `tests/unit/media/media-policy.test.ts`; `branch-api.test.ts` (no other branch's tag expires) |
| T-SITE-5…8 (M5) | `tests/unit/domain/branch-websites.test.ts` (stay label, switch target, reserved slugs incl. `about`/`contact`/`rooms`/`facilities`, map allowlist, branch schemas, redirect table, default-branch guard), `tests/unit/public/components.test.tsx` (switcher, links, badge, map), `public-site.test.ts` (map URL re-check), `sitemap.test.ts` |
| T-BR-1…4 (M5) | `tests/integration/branch-api.test.ts` (P1–P4, A1–A3: 200/201/400/401/403/404/409/422, online booking refused, audit, tags) |
| T-CAT-1, T-CAT-2 (M5) | `tests/integration/content-writes.test.ts` "accommodation type", `public-site.test.ts`, `tests/unit/content/forms.test.ts` |
| E2E-S-1…5 (M5) | `tests/e2e/public-site.spec.ts` (one branch: `/` 307, redirect table, canonicals, sitemap) and `tests/e2e/branch-websites.spec.ts` (activates `demo-giza` through the admin: chooser, switcher, isolation, distinct titles, apartment, map and blocked frames, no popup, CMS selector, settings, default-branch guard) |

## Unit (domain/application; no database)

| Id | Subject | Cases |
| --- | --- | --- |
| T-DATE-1…8 | `LocalDate`, `StayRange` | Parse and validate (2027-02-29 invalid, 2028-02-29 valid); nights; adjacency (no overlap); partial and contained overlap; zero and negative length; max stay; horizon; branch "today" across Cairo DST change dates |
| T-AV-1…6 | `AvailabilityCalculator` | All nights free; one night full; capacity 0 from blocks; quantity (several units) > free; empty stay rejected; reason reported |
| T-PR-1…6 | `NightlyPriceResolver` | Base fallback; period boundary (end exclusive); unpriced night; worked example 1 ($260.00); immutable resolved values (M6-T2). Persisted reservation snapshot immutability and override reason/authorization remain planned for M8 |
| T-QUOTE-1…10 | `QuoteCalculator` (ADR 027) | Order of operations; worked example 2 ($640.26); half-up at exactly .5 cent (example 3); percent coupon rounding; fixed coupon capped at subtotal (example 4); zero services; several units; VAT 0% and 100% bounds; VAT unset flag; no floating point |
| T-CPN-1…5 | `CouponPolicy` | Each refusal reason (`NOT_FOUND`, `INACTIVE`, `NOT_YET_VALID`, `EXPIRED`, `WRONG_BRANCH`, `LIMIT_REACHED`, `PHONE_LIMIT_REACHED`); case-insensitive match; all-branches vs listed branches |
| T-SVC-1…2 | Services | Added only when requested; inactive service refused |
| T-TAX-1…2 | VAT rules | Computed once on taxable; stored rate used on modification |
| T-LIFE-1…10 | `ReservationStateMachine` | Each allowed transition (pay at hotel → `CONFIRMED`; Paymob → `AWAITING_PAYMENT` → `CONFIRMED` / `PAYMENT_FAILED`); each forbidden one (no `PENDING`, no `DECLINED`); date preconditions for check-in and no-show; early check-out shortening; paid cancellation requires refund path |
| T-PAY-1…4 | Payment rules | Amount and currency must match; late success decision (PY-5); hold expiry; zero-total booking cannot choose Paymob |
| T-CXL-1…3 | `CancellationDeadline`, request rules | 24 hours before branch check-in time in the branch zone, across DST; booking made inside the window; one open request |
| T-REF-1…3 | Reference generator | Alphabet, length, normalization of ambiguous characters |
| T-PHONE-1…4 | `PhoneNumber` | Normalization to E.164, invalid numbers, equality across formats |
| T-SYNC-1…5 | Sync due calculation | Due at last completed + interval; `STARTED` moves the next reminder; a new `COMPLETED` clears it; interval change applies next time; settings bounds |
| T-SITE-5…8 | Branch site rules | Navigation label rule (Rooms / Apartments / Rooms & Apartments); switch target mapping; reserved slugs; map embed allowlist |
| T-AUTHZ-1 | Capability matrix | Table-driven against [user-roles-and-permissions.md](../requirements/user-roles-and-permissions.md) |
| T-AUTHZ-2 | Authorization sweep (extended) | Every reservation, payment, cancellation, commercial, and marketing use case × role × branch refuses before any port call |
| T-VAL-1…5 | Contract schemas | Strict unknown-field rejection (including price, discount, VAT on public create); guest field limits; control characters; idempotency key format |
| T-ARCH-1…4 | Boundaries | D-7, D-8, D-9, D-11 from [dependency-rules.md](../architecture/dependency-rules.md); OpenAPI freshness |

## Integration (real PostgreSQL)

| Id | Subject |
| --- | --- |
| T-DB-1…8 | Migrations apply on a copy of current data; branch backfill of rooms, facilities, pages; unique `(branchId, key)` on pages; composite FKs reject cross-branch rows; exclusion constraints; checks (totals, coupon kinds, hold); unique reference, idempotency (`NULLS NOT DISTINCT`), external reference, upper-case coupon code; drift check |
| T-SITE-1…4 | Branch-scoped public queries; branch creation seeds three pages; cache tags per branch; inactive branch hidden |
| T-BR-1…4 | Branch API (P1–P4, A1–A3); online booking refused without VAT or check-in time |
| T-CAT-1…2 | Accommodation type and apartment facts persisted and returned |
| T-RES-1…12 | Create website pay-at-hotel (`CONFIRMED`, snapshot, redemption, audit, outbox in one transaction), staff, and external reservations end to end; several units; price changed; coupon refused; inactive branch; unpublished listing; occupancy; replay; key reuse with a different body; per-phone cap; failure leaves no rows |
| T-INV-1…6 | Blocks refused when overselling; unit deactivation; overlap; capacity read model |
| T-QUOTE-11…12 | API-P6 end to end with services, coupon, VAT; rate limit on coupon attempts |
| T-CPN-6…8 | Persistence; case-insensitive uniqueness; Manager branch scope |
| T-SVC-3…4 | Service management API and audit |
| T-TAX-3…4 | VAT setting API (Admin only) and audit |
| T-PAY-5…10 | Fake gateway: checkout creation failure → `PAYMENT_FAILED`; verified success → `CONFIRMED` with messages; forged or mismatched callback ignored; duplicate ignored; hold expiry job; reconciliation job; refund pending, succeeded, failed, retry |
| T-CXL-4…8 | Request creation and deadline; one open request; Manager and Admin decisions with branch scope; rejection keeps `CONFIRMED`; approval of paid booking cancels only after refund confirmation; audit and messages |
| T-LKP-1…4 | Token hash lookup, expiry, rotation; guest session sees only its phone's reservations |
| T-RPT-1…6 | Report definitions on a fixed dataset (occupancy, revenue excluding VAT, VAT, discounts, payments and refunds, cancellations, PMS-entry ages) |
| T-GST-1…10 | Code request and confirm (hash stored, 10-minute expiry, 5 attempts, per-number and per-client limits); token single use; blocked number gets no code and existing tokens fail; guest profile upsert with marketing opt-in; staff entry links or creates an unverified profile; block and unblock audited and limited to `guests:block` |
| T-SYNCAPI-1…4 | Sync status (including not-entered count) and checkpoints per branch; one checkpoint clears all receptionists of the branch; branch access enforced; audit appended |
| T-PMS-1…2 | Mark entered in hotel system: once only, audited, branch-scoped, `WEBSITE` only |
| T-AUD-1…3 | Audit appended in the same transaction (rollback leaves none); redaction |
| T-NTF-1…3 | Outbox claim `SKIP LOCKED`; retry with backoff; token scrubbed after send; confirmation rows only for `CONFIRMED` |
| T-WA-1…3 | `WhatsAppSender` contract with a fake adapter: template resolution by purpose and language and variable order, delivery failure maps to `VERIFICATION_UNAVAILABLE` or an outbox retry, no secrets or codes in logs |
| T-WA-4…7 | WhatsApp setup (Q-67): settings and templates Admin-only and audited, access token never returned; unknown variable keys refused and one active template per purpose and language; missing number or template → `WHATSAPP_NOT_CONFIGURED` and nothing sent; test message result stored and rate-limited |
| T-MKT-1…6 | Audience excludes no opt-in, opted out, blocked, other branches, inside frequency window; Manager scope; feedback queued once per check-out and never before |
| T-HTTP-1…10 | Route Handlers with `Request` objects: status mapping, problem shape, `415`/`413`, CSRF refusal, `401`/`403`/`404` cross-branch, `412`, `429`, webhook raw body and `401` on bad HMAC, `ETag` |
| C-1…15 | Concurrency ([database/integrity-and-concurrency.md](../database/integrity-and-concurrency.md#proof-plan-integration-tests-on-real-postgresql)), 20 iterations each |

## E2E (Playwright, Chromium)

| Id | Flow |
| --- | --- |
| E2E-S-1 | One active branch: `/` redirects to it; two: `/` shows the chooser |
| E2E-S-2 | Branch switcher keeps the page type, falls back to listing or home |
| E2E-S-3 | Branch content isolation: texts and images differ per branch; a listing of branch A 404s under branch B; apartment badge and facts |
| E2E-S-4 | Redirects from every accepted URL and legacy path to the branch URL (single hop, permanent) |
| E2E-S-5 | Branch map renders; address and directions remain without the map; no promotion popup anywhere |
| E2E-G-1 | Pay at hotel: search → several units → verify phone → extras → coupon → review with VAT → submit → "Confirmed" with reference → manage link works; DB status `CONFIRMED` |
| E2E-G-2 | Last unit: a second browser context gets "no longer available"; nothing created |
| E2E-G-3 | Paymob (fake gateway): redirect, success → return page shows "Confirmed"; failure or expiry → "Payment not completed", units released |
| E2E-G-4 | Price changed and coupon refused paths |
| E2E-G-5 | Phone verification: wrong code, expiry, resend; blocked number cannot book; "My reservations" with phone and code |
| E2E-G-6 | Cancellation request before the deadline; contact details after it |
| E2E-G-7 | Extras never preselected; cross-sell adds only when accepted |
| E2E-G-8 | Validation and accessibility (axe) on every booking step, 320 px overflow sweep, touch targets; branch with booking off shows the disabled Book Now |
| E2E-R-1 | Receptionist signs in and sees only their branch |
| E2E-R-2 | New website booking appears as "Not yet in hotel system"; mark entered; overdue highlight with a fake clock |
| E2E-R-3 | Manual reservation; external reservation; external conflict notice |
| E2E-R-4 | Block a unit; availability grid updates; refused block that would oversell |
| E2E-R-5 | Assign units, check in, check out |
| E2E-R-6 | Sync reminder: with a fake clock the pop-up opens on any dashboard page when due, cannot be dismissed without an answer, "I'm syncing now" re-opens after the follow-up delay, and "I have synced" clears it in a second receptionist's browser |
| E2E-R-7 | Receptionist cannot cancel a paid booking or decide cancellation requests |
| E2E-M-1 | Manager edits rates; existing reservation keeps its price |
| E2E-M-2 | Manager reports reflect seeded data |
| E2E-M-3 | Manager blocks a number with a reason; that number can no longer get a code; unblock restores it; receptionist sees no block button |
| E2E-M-4 | Manager creates a branch-limited coupon and sets service prices; a guest uses the coupon |
| E2E-M-5 | Manager sends a broadcast (fake WhatsApp adapter); only opted-in, non-blocked guests receive it |
| E2E-M-6 | Manager approves a paid cancellation request (fake gateway): refund pending → completed → `CANCELLED`; rejects another with a reason |
| E2E-A-1 | Admin CMS still works per branch (existing suites updated in M5) |
| E2E-A-2 | Receptionist and Manager get `403` / denied page on CMS routes and actions |
| E2E-A-3 | Admin assigns branch, and the receptionist's access changes on the next request |
| E2E-A-4 | Admin sets VAT (any rate); Manager cannot see the setting; online booking cannot be enabled before it is set; new quotes use the new rate |
| E2E-A-5 | Admin enters the WhatsApp number, adds a template, and sends a test message (fake adapter); with the number empty, online booking cannot be enabled and verification shows the not-configured message |
