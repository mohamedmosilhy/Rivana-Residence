# M8 — Reservations, immediate confirmation, phone verification, and messages

Status: **Not started** (the prerequisite task M8-T0 is accepted, 2026-11-13; the milestone spec and breakdown approval are still pending). Branch: `m8-reservations`. Follow the [milestone loop](./README.md#the-loop-every-milestone-follows).

> **Done first (accepted 2026-11-13): [M8-T0, application ports consolidation](#0-prerequisite-task-m8-t0-application-ports-consolidation).** The owner decided on 2026-11-13 that the old shared `src/application/ports/` files move into their modules before any other M8 task starts, so every M8 repository and port is written in the module layout from the start. Next: [M8-T0b](#0b-follow-up-task-m8-t0b-public-surfaces-for-the-cms-modules), then the rest of M8.

## Objective

Every reservation operation through the REST API. A valid **pay-at-hotel** website booking becomes `CONFIRMED` in the transaction that reserves its inventory; invalid, unavailable, blocked, or over-limit bookings create nothing. Confirmation messages (email and WhatsApp) are queued in that same transaction and sent only after commit. Staff create, record, modify, cancel (unpaid), assign, check in and out, mark no-shows, and mark website bookings as entered in the hotel system. Online payment is M9.

## Read first

- ADRs [016](../../adr/016-inventory-and-concurrency.md), [019](../../adr/019-guest-reservation-access.md), [024](../../adr/024-immediate-confirmation.md), [027](../../adr/027-booking-price-composition.md), [028](../../adr/028-whatsapp-guest-messaging.md) (transactional messages only)
- [domain/reservation-lifecycle.md](../../domain/reservation-lifecycle.md), [domain/domain-model.md](../../domain/domain-model.md) (Reservation, Guest, rules R and GV)
- [database/integrity-and-concurrency.md](../../database/integrity-and-concurrency.md) (booking transaction, C-1…C-11)
- [api/api-contracts.md](../../api/api-contracts.md) (P7, P9, P10, G1, G3, G4, S1–S6, S9–S16, S28, S29, S50–S53)
- [security/threat-model.md](../../security/threat-model.md)

## Blocking questions

- Q-67 (decided): the Admin enters the WhatsApp Business number and manages the templates in the dashboard; the number is an empty placeholder until the client supplies it. Q-10 (provider): build the Meta Cloud API adapter unless the client chooses otherwise. The milestone completes with the fake adapter; a real send through the test-message button is recorded only if the client has supplied the number, token, and approved templates, and the report says which.
- Q-60 ★ (per-phone caps), Q-18, Q-19: recommendations accepted unless answered.

## Skills for this milestone

| Step | Skill | Notes |
| --- | --- | --- |
| Spec | `/architect` (`FEATURE`) | Booking unit of work, outbox dispatcher, verification token design, `WhatsAppSender` contract |
| Build | `/develop` (logic track) | Order: migration → domain state machine → unit of work → use cases → API → dispatcher |
| Tests | `/test` | Concurrency suite C-1…C-11, 20× green |
| Failures | `/debug` | |
| Proof | `/check verify` | Book via API with the fake WhatsApp adapter; inspect DB rows, outbox, and audit |
| Review | `/check review` | Plus a mid-milestone security review of tokens, verification, and logs |
| After merge | `/sync` | |

## In scope

Reservation tables and snapshot, website pay-at-hotel creation with immediate confirmation, staff creation and external recording, lifecycle transitions (no payment), PMS-entry marker, phone verification, guest profiles with marketing-consent fields, blocking, guest access (view), history, outbox and dispatcher, transactional email and WhatsApp templates, per-phone caps, OpenAPI, concurrency tests.

## Out of scope (binding)

- Paymob, `AWAITING_PAYMENT`, refunds, cancellation requests (M9). `paymentMethod` accepts only `PAY_AT_HOTEL` in M8.
- Any screen (M10, M11).
- Broadcasts and feedback messages (M13); consent is only stored.
- `PENDING` and `DECLINED` statuses: they must not exist anywhere.

## Carried over from M7 (owner notes, 2026-11-13)

Raised in the M7-T6 review and accepted by the owner. The agent who plans the named task includes the item in that task's card.

1. **Verified phone for per phone coupon limits (plan in M8-T5 and M8-T7).** P6 accepts an unverified `phone` today and `CouponRedemptionReader` is a zero adapter. When M8-T7 replaces it with persisted redemptions, honour the per phone coupon limit only for a phone proved by a phone verification token (M8-T5), or stop returning `PHONE_LIMIT_REACHED` on public routes. Otherwise anyone can probe which phone used which coupon, which breaks AC-4 of M7. Add a test that an unverified phone never changes the refusal.
2. **Slim public listing reader (plan in M8-T7, after M8-T0b).** `QuoteBooking` (and `SearchPublicAvailability`) read the full published room graph through `RoomRepository.listPublished` just to resolve slug, name, accommodation type, and occupancy limits. Add a small port (for example `PublicListingReader` returning id, slug, name, accommodation type, maxAdults, maxChildren) in the owning module and use it in both. No behavior change; the integration tests of P5 and P6 must pass unchanged.
3. **Redemption count and the coupon row lock.** The zero reader hides a race that M8 must close: take the coupon row lock and count inside the booking transaction (spec 0004, Decision 4; plan it in M8-T7).

## Task breakdown

Planned, reviewed, and accepted one task at a time ([agent-workflow.md](../../engineering/agent-workflow.md)). Rows are confirmed at milestone open; the numbered **Tasks** below hold the detail.

| Task | Title | Risk | Depends on | Covers (criteria, tests) | Status |
| --- | --- | --- | --- | --- | --- |
| M8-T0 | Application ports consolidation: move the old shared ports into their modules (refactor, no behavior change) | Medium | M7 | Existing tests unchanged and green; new `ports` boundary test | Accepted |
| M8-T0b | Public surfaces for the CMS modules: `index.ts` per old module and D-8 extended to them (refactor, no behavior change) | Medium | T0 | Existing tests unchanged and green; D-8 test extended | Not started |
| M8-T1 | Migration `reservations`: tables, checks, composite FKs, exclusion and idempotency constraints, demo seed | Critical | T0 | T-DB-6…8; drift check | Not started |
| M8-T2 | Reservation domain: state machine, invariants R-1…R-10, reference, `PhoneNumber`, verification and per-phone policies | Critical | T0 | T-LIFE-1…10, T-REF-1…3, T-PHONE-1…4, T-VAL-1…5 | Not started |
| M8-T3 | Reservation and guest repositories, unit-of-work binding | Medium | T1 | repository integration tests | Not started |
| M8-T4 | WhatsApp setup: settings, templates, sender port, provider and fake adapters, test message, minimal Admin screen | Critical | T1 | AC 10; T-WA-1…7 | Not started |
| M8-T5 | Phone verification: request and confirm, limits, API P9 and P10 | Critical | T2, T3, T4 | AC 7; T-GST (verification) | Not started |
| M8-T6 | Notifications: outbox, dispatcher, email templates, token expiry job | Critical | T3, T4 | AC 4; T-NTF-1…3 | Not started |
| M8-T7 | `CreateWebsiteReservation` (pay at hotel) and API P7 | Critical | T5, T6, M7 | AC 1–4, 8; T-RES, C-1…C-3, C-11 | Not started |
| M8-T8 | Staff and external reservations: `CreateStaffReservation`, `RecordExternalReservation` | Critical | T7 | AC 9; T-RES, T-AUTHZ-2 | Not started |
| M8-T9 | Inventory-changing transitions: staff cancellation with coupon release, `ModifyReservationStay` | Critical | T8 | AC 6; C-4 (block vs booking), C-5…C-7 | Not started |
| M8-T10 | Operational transitions: guest edit, unit assignment, check-in, check-out, no-show, `MarkEnteredInHotelSystem`, resend link | Critical | T8 | AC 5; T-PMS-1…2, C-9, C-10 | Not started |
| M8-T11 | Guests and guest access: search, profile, block and unblock; manage-token and guest-session reads | Critical | T5, T7 | AC 7, 8; T-GST, T-LKP-1…4 | Not started |
| M8-T12 | Sync status and checkpoints API | Medium | T7 | T-SYNCAPI-1…4 | Not started |

## Tasks

### 0. Prerequisite task (M8-T0): application ports consolidation

Owner decision, 2026-11-13. Written as a task card; the agent still runs the normal Stage 1 plan, waits for approval, and stops for acceptance. It is a refactor: **no behavior, schema, API, or contract change**.

1. **Objective.** Make every application port live with the module that uses it, as the reservation-era modules already do (`src/application/<module>/ports.ts`: `audit`, `branches`, `inventory`, `pricing`, `reservations`, `services`, `commercial`). Retire the two shared files `src/application/ports/repositories.ts` (576 lines) and `src/application/ports/providers.ts` (99 lines), except for the ports that really are shared.
2. **Why before M8.** M8 adds the largest set of new ports (reservations, guests, notifications, WhatsApp). They should follow one consistent layout, not two, and nothing in M8 should import from the old shared files.
3. **Scope in.**
   - Split `repositories.ts` and `providers.ts` into per module `ports.ts` files, with a public `index.ts` where a module has none (dependency rule D-8).
   - Proposed placement, to be **confirmed in the Stage 1 plan**: `RoomRepository`, `FacilityRepository`, `PageRepository` and their DTOs and inputs go to `content`; `SettingsRepository` to `settings`; `MediaRepository`, `MediaStorage`, `ImageProcessor` and the media types to `media`; `EnquiryRepository` and `ContactDelivery` to `enquiries`; `AdminOverviewReader` to `admin`; `BookingProvider` to `booking`; `CacheInvalidator` to `cache`; `Hasher` to `auth`.
   - Keep in `src/application/ports/` only what many modules share: `Clock`, `IdGenerator`, and the paging and actor types (`PageRequest`, `PagedResult`, `Actor`) unless the plan finds a better home. The plan lists them explicitly.
   - Update every import (about 71 files: 33 of `providers`, 45 of `repositories`, plus tests), and the infrastructure adapters that implement the ports.
   - Update the docs that mention the old location (`docs/architecture/dependency-rules.md`, `docs/engineering/engineering-standards.md`, `docs/learning/04-architecture.md`, and any spec that names the file) with a one line rule: a port lives in the module that consumes it; only truly shared ports live in `src/application/ports/`.
4. **Scope out.** Any change to a port's methods, names, or meaning; new ports; reservation tables or code; moving ports into `src/domain` (the domain stays free of I/O); renaming modules; unrelated cleanups. If a split needs a signature change, stop and ask.
5. **Requirements and behavior.** Type only moves: `tsc`, lint, and the whole existing test suite pass unchanged. No runtime difference. Dependency rules D-2 and D-8 hold after the move.
6. **Architectural considerations.** Application imports only domain and its own ports; a module imports another module's ports only through that module's public files; infrastructure adapters import ports from the owning module; composition is unchanged except for import paths. No cyclic imports between modules (check the shared paging and actor types first, they are the likely cause).
7. **Expected files.** `src/application/**/ports.ts` and `index.ts` per module, `src/application/ports/` (shrunk to the shared set), `src/infrastructure/**` adapters (imports only), `src/composition/**` (imports only), tests (imports only), the docs listed above, and `eslint` patterns or `tests/unit/architecture/module-boundaries.test.ts` extended so the old CMS modules are covered by D-8 too.
8. **Dependencies.** M7 accepted and merged. Blocks every other M8 task.
9. **Acceptance criteria.** (a) `src/application/ports/repositories.ts` is gone and `providers.ts` holds only shared ports, or both are gone with the shared set in one small named file. (b) No file outside the owning module imports a module's port through a deep path. (c) `npm run check`, the full integration suite, and the Chromium E2E suite pass with the same test counts as before, plus the new boundary test. (d) `git diff` shows import and file moves only: no change to any port method, DTO field, SQL, route, or contract, and `docs/api/openapi.json` is unchanged. (e) The docs state the rule.
10. **Tests.** No new behavior tests. Add one architecture test that fails if `src/application/ports/` grows beyond the agreed shared set or a module imports another module's `ports.ts` directly. Run the full gates.
11. **Risk tier.** Medium: no money, lock, or authorization logic changes. It touches many files, so the review focuses on "moves only" (the reviewer checks the diff for unintended edits) and on import cycles.
12. **Sizing note.** If the plan finds it is too large for one sitting, propose splitting by module group (for example content and media first, then settings, enquiries, admin and the rest) and wait for approval. Do not start the split without it.
13. **As built (owner follow-up 2026-11-13).** The shared `src/application/ports/` folder no longer exists. `Clock` and `IdGenerator` moved to `src/application/shared/providers.ts`, next to the other shared application files (`result.ts`, `actor.ts`, `pagination.ts`). Module ports are `src/application/<module>/ports.ts`, imported as `@/application/<module>/ports` (the "listed ports" form of D-8). This supersedes items 3, 7, 9, and 10 wherever they mention keeping `src/application/ports/`. `Hasher` went to `media` (its only user), not `auth`; `Actor` and the paging types are in `src/application/shared/`. The old CMS modules did not get an `index.ts`, and D-8's public surface list was not extended to them: that is a separate, larger change (it would also move use case imports) left for the owner to schedule.

### 0b. Follow-up task (M8-T0b): public surfaces for the CMS modules

Owner decision, 2026-11-13, recommended in the M8-T0 review package and accepted. Written as a task card; the agent still runs the normal Stage 1 plan, waits for approval, and stops for acceptance. A refactor: **no behavior, schema, API, or contract change**. It should be accepted before M8-T3 (the repositories task), so the new M8 modules and the old ones follow the same rule. It does not block M8-T1 or M8-T2.

1. **Objective.** Give the older CMS modules (`content`, `media`, `settings`, `enquiries`, `admin`, `booking`, `cache`, and `public` if the plan finds it needed) the same public surface the reservation-era modules have: one `index.ts` per module, and every import from outside the module goes through it (rule D-8). Today they have `ports.ts` (after M8-T0) but no `index.ts`, and D-8 does not cover them.
2. **Scope in.** An `index.ts` per module exporting what other layers use (use cases, ports and DTO types, helpers); rewriting deep imports of those modules (`@/application/<module>/<file>`) in `src/app`, `src/presentation`, `src/composition`, `src/infrastructure`, and tests to the index; adding the modules to `PUBLIC_SURFACE_MODULES` in `tests/unit/architecture/module-boundaries.test.ts` and `eslint.config.mjs`; the docs that list D-8 (`docs/architecture/dependency-rules.md`).
3. **Scope out.** Any change to a use case, port method, DTO field, SQL, route, or contract; the `domain` side (only `src/application` modules here unless the plan shows the domain modules are equally simple); renames; unrelated cleanups.
4. **Behavior.** Type and import moves only. Index files must not create runtime import cycles (import ports with `import type`; check `catalog-queries`, `page-commands`, `media-library`, and `public-site`, which depend on each other's ports).
5. **Architecture.** D-2 and D-8 hold for every module after the move; `index.ts` files re-export, they hold no logic; client bundles do not gain server code (check `src/presentation` imports of application types, rule D-13).
6. **Expected files.** `src/application/<module>/index.ts` (new), about 40 to 60 importers (import lines only), the two enforcement files, the doc.
7. **Dependencies.** M8-T0 accepted.
8. **Acceptance criteria.** (a) Every module in the list has an `index.ts` and appears in `PUBLIC_SURFACE_MODULES`. (b) The D-8 test and the ESLint rule pass for them. (c) `npm run check`, the full integration suite, and the Chromium E2E suite pass with the same counts as before, plus the extended test. (d) The diff is import and file moves only, `docs/api/openapi.json` is unchanged. (e) The doc lists the modules.
9. **Tests.** No new behavior tests; extend the D-8 architecture test and run the full gates.
10. **Risk tier.** Medium. If the plan finds it too large, propose splitting by module group and wait for approval.

### 1. Database (migration `reservations`)

Tables as in [data-model.md](../../database/data-model.md): `WhatsAppSettings` (singleton, number empty), `WhatsAppTemplate`, `Reservation` (status enum without `PENDING`/`DECLINED`, price snapshot columns, `vatRateBasisPoints`, `couponId`, `couponCode`, `pmsEnteredAt`, `pmsEnteredById`, `paymentMethod` enum with `PAY_AT_HOTEL` and `PAYMOB`, `paymentStatus` enum), `ReservationRoom` (several per reservation, same stay), `ReservationNight`, `ReservationService`, `CouponRedemption`, `Guest` (with `marketingOptInAt`, `marketingConsentVersion`, `marketingOptOutAt`), `PhoneVerification`, `NotificationOutbox`, `BranchSyncCheckpoint`; checks, composite FKs, the double-assignment exclusion constraint, `UNIQUE NULLS NOT DISTINCT` idempotency key.

### 2. Domain (`src/domain/reservations`, `src/domain/guests`)

1. `ReservationStateMachine` with the states and transitions in the lifecycle document (create → `CONFIRMED` for website pay-at-hotel, staff, and external; cancel; check in; check out with early shortening; no-show). Pure, given branch "today".
2. Reservation invariants R-1…R-10; `ReservationReference` generator rules; `PhoneNumber` (E.164 via `libphonenumber-js`, confirm the dependency in the spec); verification rules GV-1…6; per-phone caps (Q-60) as a policy.

### 3. Application

1. `CreateWebsiteReservation` (pay at hotel) in one unit of work: idempotency lookup → consume verification token (phone matches, not blocked) → per-phone cap check → expire overdue payment holds for these listings (no-op until M9) → lock listings in id order → availability for each line's units → nightly prices → services → lock coupon row and count redemptions → `QuoteCalculator` → compare with `expectedTotal` (`409 PRICE_CHANGED` with the new quote) → insert reservation `CONFIRMED`, lines, nights, services, redemption → upsert guest (latest name and email; marketing opt-in if ticked, with wording version) → audit → outbox (email and WhatsApp confirmation, staff alert) → commit.
2. `CreateStaffReservation` (`CONFIRMED`, pay at hotel, optional coupon and services, manual price needs `pricing:override`), `RecordExternalReservation`.
3. Transitions: `CancelReservation` (staff; unpaid only in M8), `ModifyReservationStay` (re-quote changed nights, services kept, VAT recomputed, old and new totals; Q-19; services with a per night or per person per night unit keep their stored unit and child price and are recomputed for the new nights and guests, per booking services stay unchanged, owner decision 2026-11-11, PR-11), `UpdateReservationGuest`, `AssignPhysicalRoom`, `CheckIn`, `CheckOut` (early shortening), `MarkNoShow`, `MarkEnteredInHotelSystem` (`reservations:pms-entry`; sets `pmsEnteredAt` once, audited), `ResendManageLink`.
4. Guests: `RequestPhoneVerification`, `ConfirmPhoneVerification`, `SearchGuests`, `GetGuest`, `BlockGuestPhone`, `UnblockGuestPhone`.
5. Guest access: `GetGuestReservation` (manage token), `ListGuestReservations` and `GetGuestReservationByReference` (guest session).
6. Sync: `GetSyncStatus`, `RecordSyncCheckpoint` (API only; the reminder UI is M11).
7. Coupon redemption release on staff cancellation (Q-57 recommendation).
8. WhatsApp setup (Admin, `settings:edit`): `GetWhatsAppSettings`, `UpdateWhatsAppSettings`, `ManageWhatsAppTemplates` (variable keys from a fixed allowlist), `SendWhatsAppTestMessage` (rate-limited, audited, result stored). A minimal Admin screen `/admin/settings/whatsapp` ships in this milestone so the setup can be tested: number fields, template list and form, setup-gap list, token-configured indicator, and **Send test message**. Online booking for a branch cannot be enabled while WhatsApp is not configured. The status includes the count of website bookings not yet entered in the hotel system.

### 4. Infrastructure

1. Prisma repositories under `src/infrastructure/db/prisma/repositories/reservations/` and `guests/`; unit of work binding.
2. `WhatsAppSender` port with a Meta (or chosen provider) adapter in `src/infrastructure/whatsapp/` and a fake adapter that records messages for tests. The adapter reads the business number and phone-number id from `WhatsAppSettings`, the access token from the server environment, and resolves each message purpose and language to the active `WhatsAppTemplate` (name, language, ordered variables from the allowlist). Missing configuration or template → `WHATSAPP_NOT_CONFIGURED`, nothing sent.
3. Email templates (plain text + simple HTML) for confirmation, cancellation, and manage link, reusing the SMTP setup.
4. Outbox dispatcher (`npm run reservations -- outbox`): claims rows with `FOR UPDATE SKIP LOCKED`, sends, retries with backoff, scrubs the manage link after sending. `npm run reservations -- expire-tokens`.

### 5. API

P7 (pay at hotel), P9, P10, G1, G3, G4 (view only), S1–S6, S9–S16, S28, S29, S50–S53, A6–A8. OpenAPI complete for these.

## Database impact

One migration, additive. Demo seed: reservations in every status (fictional guests, `+1 555 01xx` numbers), a blocked guest, a coupon redemption, unentered and entered website bookings, sync history.

## API impact

As listed. API-S7 and API-S8 (confirm and decline) do not exist.

## Acceptance criteria

1. A valid pay-at-hotel website booking returns `201` with `status: "CONFIRMED"` and a reference; the database row is `CONFIRMED`; one email and one WhatsApp confirmation row are in the outbox from the same transaction; a staff alert is queued.
2. A booking whose inventory is gone returns `409 INVENTORY_UNAVAILABLE`; a changed price returns `409 PRICE_CHANGED` with the new quote; an invalid coupon, a blocked phone, a missing or used verification token, or an exceeded per-phone cap returns its documented error. In every failure case no reservation, redemption, audit, or outbox row exists.
3. Ten parallel bookings for the last unit produce exactly one `CONFIRMED` reservation (C-1); a multi-unit booking that needs two units when one is free creates nothing; coupon total and per-phone limits hold under parallel use (C-11).
4. The confirmation message is sent only after commit (a rolled-back transaction leaves no outbox row) and its text says "confirmed".
5. `MarkEnteredInHotelSystem` sets `pmsEnteredAt` once, records the user, and is refused for other branches.
6. Staff cancellation of an unpaid reservation releases its inventory and coupon redemption, notifies the guest when chosen, and is audited.
7. Verification: 10-minute expiry, 5 attempts, per-number and per-client limits, hashed codes, single-use token, blocked numbers get no code, identical responses for phones with and without reservations.
8. No log line contains a guest name, email, phone, code, or token (captured-log test).
9. The authorization sweep covers every new use case for every role, an unassigned branch, and another branch.
10. Only an Admin can read or change the WhatsApp settings and templates and send a test message; the access token is never returned; with the number empty, verification requests return `503 WHATSAPP_NOT_CONFIGURED` and nothing is sent; a template with an unknown variable key is refused; the test message reports the provider's result (fake adapter in tests).

## Tests

- Unit: T-LIFE-1…10, T-REF-1…3, T-PHONE-1…4, T-VAL-1…5, T-AUTHZ-2.
- Integration: T-WA-4…7, T-RES-1…12, T-PMS-1…2, T-GST-1…10, T-LKP-1…4, T-NTF-1…3, T-WA-1…3, T-AUD-1…3, T-SYNCAPI-1…4, T-HTTP-1…10, T-DB-6…8.
- Concurrency: C-1…C-3, C-5…C-7, C-9…C-11, plus C-4 extended to block versus booking.

## Evidence for the report

Concurrency output (20×); a booking walk-through with request, response, DB rows, outbox rows, and audit rows (personal data redacted); log redaction proof; whether the WhatsApp adapter ran against the provider's sandbox or only the fake.

## Risks

- RK-1: confirmed bookings can now collide with unrecorded PMS bookings; operations procedures and the PMS-entry marker reach the UI in M11.
- Email deliverability; template names entered in Rivana not matching what Meta approved (the test message catches this).
- Token handling mistakes: mid-milestone security review.

## Handoff

Close the milestone ([README steps 8–15](./README.md#the-loop-every-milestone-follows)), report, then stop. M9 has not started.
