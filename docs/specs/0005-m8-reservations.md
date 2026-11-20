# 0005. Reservations, immediate confirmation, phone verification, and messages (M8)

**Date**: 2026-11-14
**Status**: In Progress (owner approved the content; status moves with the milestone)
**Owner approval**: Spec, task breakdown, and the seven decisions below accepted as recommended, 2026-11-14
**Mode**: FEATURE
**Branch**: `m8-reservations`
**Brief**: [m8-reservations.md](../delivery/milestones/m8-reservations.md)

## Summary

M8 turns the quote from M7 into real reservations, through the REST API only. A valid pay at hotel website booking becomes `CONFIRMED` in the same transaction that takes its inventory. Anything invalid, unavailable, blocked, or over a limit creates nothing. The confirmation email and WhatsApp message are written to an outbox in that same transaction and sent only after commit. Staff can create, record, change, cancel (unpaid only), assign, check in, check out, mark no show, and mark a website booking as entered in the hotel system. Guests prove their phone with a WhatsApp code, and an Admin sets up WhatsApp (number, templates, test message) in the dashboard.

No business rule is invented here. Every rule comes from the ADRs, the lifecycle and domain documents, and the question register. This spec only records local build choices, and the few that touch a contract, a lock order, or a dependency are listed under **Decisions for the owner**.

## Context

M7 is accepted and merged, and M8-T0 (application ports consolidation) is accepted. Available today: the shared date, stay, occupancy, and money values; the pure inventory and pricing rules; `InventoryGuard`, `InventoryLock`, and `ReservationUnitOfWork` (M6-T4); `QuoteBooking` and `QuoteCalculator` (M7); the audit log; the capability list (it already has every `reservations:*`, `guests:*`, and `settings:edit` capability this milestone needs); the HTTP wrappers and the single problem serializer; the public rate limiter; SMTP delivery.

Placeholders M8 must replace (the sold consumption adapter in M8-T3, the coupon reader in M8-T7, the checkpoint reader in M8-T12): `CouponRedemptionReader` (a zero adapter), the sold consumption adapter used by the availability reader (returns none), and `LastSyncCheckpointReader` (a null adapter).

Not available: any reservation, guest, verification, outbox, or WhatsApp table or code; `libphonenumber-js` (not in `package.json`, ADR 019 calls it a new dependency to confirm).

The project stays one Next.js application on PostgreSQL and Prisma. The Route Handlers guide in `node_modules/next/dist/docs/` governs every new handler.

### Decision provenance

| Input | Disposition |
| --- | --- |
| ADR 016, 019, 024, 027, 028 | Binding. The spec implements them and adds no business rule. |
| Lifecycle (states, transitions, idempotency, reference format), domain rules R-1…R-10 and GV-1…6, integrity document C-1…C-11, API contracts | Binding. The data model sketch in `docs/database/data-model.md` is the schema target for the migration. |
| Q-67 (decided) | Admin enters number, phone number id, and templates in the dashboard. Number is an empty placeholder. |
| Q-10 | Meta Cloud API adapter, swappable behind the `WhatsAppSender` port. The milestone completes with the fake adapter. A real send is recorded only if the client supplied number, token, and approved templates, and the report says which. |
| Q-60 | At most 2 upcoming pay at hotel website bookings and 1 open payment hold per phone. The hold part is a no op until M9. |
| Q-18 | No reinstating and no undoing check in. |
| Q-19 | Changed nights are re priced at current rates, old and new totals shown, manager override possible. |
| Q-57 | Staff cancellation releases the coupon redemption. |
| Owner note, M7 (2026-11-13) | Three carried items, planned in M8-T7 and M8-T7b: verified phone for per phone coupon limits, the slim public listing reader, the coupon row lock with the redemption count. |
| Owner decision, 2026-11-11 | Per night and per person services keep their stored unit and child price and are recomputed on a stay change. Per booking services do not change (PR-11). |

Out of scope (binding, from the brief): Paymob, `AWAITING_PAYMENT` flows, refunds, cancellation requests (M9); any screen except the minimal Admin WhatsApp screen the brief puts in scope; broadcasts and feedback sends (M13, consent is only stored); the `PENDING` and `DECLINED` statuses, which must not exist anywhere. `paymentMethod` accepts only `PAY_AT_HOTEL`. The enum keeps `PAYMOB`, `AWAITING_PAYMENT`, and `PAYMENT_FAILED` because the schema target already lists them and adding enum values later is a needless migration, but no M8 code can produce them.

## Requirements

Acceptance criteria keep the brief's numbering (AC-1 to AC-10). Task level detail is in each task card.

1. **AC-1**: A valid pay at hotel website booking returns `201` with `status: "CONFIRMED"` and a reference. The row is `CONFIRMED`. One email row and one WhatsApp row are in the outbox from the same transaction, and a staff alert is queued.
2. **AC-2**: No inventory returns `409 INVENTORY_UNAVAILABLE`. A changed price returns `409 PRICE_CHANGED` with the new quote. An invalid coupon, a blocked phone, a missing or used verification token, or an exceeded per phone cap returns its documented error. In every failure no reservation, redemption, audit, or outbox row exists.
3. **AC-3**: Ten parallel bookings for the last unit give exactly one `CONFIRMED` reservation (C-1). A two unit booking when one is free creates nothing. Coupon total and per phone limits hold under parallel use (C-11).
4. **AC-4**: The confirmation is sent only after commit (a rolled back transaction leaves no outbox row) and its text says "confirmed".
5. **AC-5**: `MarkEnteredInHotelSystem` sets `pmsEnteredAt` once, records the user, and is refused for other branches.
6. **AC-6**: Staff cancellation of an unpaid reservation releases its inventory and coupon redemption, notifies the guest when chosen, and is audited.
7. **AC-7**: Verification has a 10 minute expiry, 5 attempts, per number and per client limits, hashed codes, a single use token, no code for blocked numbers, and identical responses for phones with and without reservations.
8. **AC-8**: No log line contains a guest name, email, phone, code, or token (captured log test).
9. **AC-9**: The authorization sweep covers every new use case for every role, an unassigned branch, and another branch.
10. **AC-10**: Only an Admin reads or changes WhatsApp settings and templates and sends a test message. The access token is never returned. With the number empty, verification requests return `503 WHATSAPP_NOT_CONFIGURED` and nothing is sent. A template with an unknown variable key is refused. The test message reports the provider result (fake adapter in tests).

## Decision

One reservation aggregate with a pure state machine in the domain. Every write is a use case that runs `authorize` and `authorizeBranch`, then one `ReservationUnitOfWork` transaction. Routes stay thin. Network I/O (WhatsApp, SMTP) never happens inside a transaction: messages are outbox rows, and the verification code is sent right after its own commit.

### Decision 1. Lock order and the booking transaction

Order inside `CreateWebsiteReservation`, following the integrity document:

1. Idempotency lookup (scope plus key hash). Replay returns `200`; same key and different body returns `422 IDEMPOTENCY_KEY_REUSED`; a lost race returns the winner after commit, or `409 IDEMPOTENCY_IN_PROGRESS`.
2. Upsert the `Guest` row for the verified phone and **lock it** (`FOR UPDATE`). This serializes per phone caps (Q-60) and blocking checks for one number.
2a. **Repeat the idempotency lookup now that the guest lock is held.** A parallel retry with the same key waits on the lock, then finds the winner's committed row and replays it, instead of failing on the already used token (C-9). The T7 tests run C-9 with one shared token.
3. Consume the verification token (phone matches, token unused and unexpired, phone not blocked). The token row is locked and marked used in this transaction, so a rollback gives the token back.
4. Per phone cap: count the phone's `CONFIRMED` website `PAY_AT_HOTEL` reservations in any branch whose check in date is on or after that reservation's branch today (Q-78). At 2 or more, refuse with `429 BOOKING_LIMIT_REACHED` (already in the error model and P7).
5. Lock the listings in id order (`InventoryLock`, five second timeout, `503 TRY_AGAIN`). Expire overdue holds for these listings (no op until M9).
6. Check availability for every unit of every line before any insert.
7. Resolve nightly prices, active services, and the VAT rate; lock the coupon row; count unreleased redemptions and per phone redemptions under that lock; compute the quote with `QuoteCalculator`; compare with `expectedTotal`.
8. Insert reservation `CONFIRMED`, lines, nights, services, redemption; update the guest (latest name and email, marketing opt in with wording version); append audit; enqueue outbox rows; commit.

**Global lock order: guest row, then listings by id, then coupon row, then reservation rows.** Releases (cancel, no show, early check out) take only the reservation row. Block and unblock of a guest take only the guest row. This adds the guest row as a first level to the discipline in `integrity-and-concurrency.md`; that document is updated in M8-T7 with the owner's approval of this spec.

`InventoryGuard` remains the only entry for availability reducing writes, and every writer in this milestone (website, staff, external, modify) goes through it.

**Implemented in M8-T7 (accepted 2026-11-20).** `InventoryGuard.execute` gained an optional `prepare` step that runs inside the same transaction before the listing locks, so the guest row is locked first and the guard stays the only entry for availability reducing writes. `prepare` holds the replay lookup (before and under the guest lock), token consumption and the per phone cap. `QuoteBooking` runs on the transaction's readers after the locks. `SearchPublicAvailability` keeps its full room read because it renders the cards. The persisted redemption reader is phone aware inside bookings and phone blind for P6 until M8-T7b.

**Implemented in M8-T7b (accepted 2026-11-20).** `POST /api/v1/reservations` (P7) reads the `Idempotency-Key` header (documented in OpenAPI), takes the `booking-create` bucket (5 per client per hour, every request counts, owner decision), and maps the use case through a DTO that returns `manageUrl` only on the first `201`. `BRANCH_NOT_BOOKABLE` carries `context.reason`, `PAYMOB` returns `409 PAYMENT_METHOD_UNAVAILABLE`, and a filled honeypot gets a generic `422`. Public P6 drops any `phone` (Decision 9.1). `IDEMPOTENCY_IN_PROGRESS` is not used: a parallel retry waits on the guest lock and replays the winner.

### Decision 1b. Idempotency fingerprint

The fingerprint is a SHA-256 of the normalized body (stay, sorted lines, sorted services, coupon code, payment method, expected total) plus, for website bookings, the verified phone and the verification token hash. A different client replaying the same key and body without that token fails with `422 IDEMPOTENCY_KEY_REUSED` and never sees another guest's reference.

### Decision 2. Domain

`src/domain/reservations`:

- `ReservationStateMachine`: pure, takes the current state, the action, and branch today. States and transitions exactly as the lifecycle document, minus the Paymob ones. `consumesInventory` is derived from status (R-6) and written by the repository in the same transaction as every status change.
- Invariants R-1…R-10 as pure checks. R-2 (line stay equals reservation stay) holds because v1 has one stay per booking.
- `ReservationReference`: `RR-` plus 8 Crockford base32 characters (no `I`, `L`, `O`, `U`) from `crypto.randomBytes`; the generator takes a random source port so tests are deterministic. Unique constraint. A unique violation aborts a PostgreSQL transaction, so the insert uses `INSERT … ON CONFLICT (reference) DO NOTHING RETURNING` and regenerates up to 3 times; a lost idempotency race is re read in a fresh transaction after the winner commits.
- Pure policies for staff stay modification (re-quote of changed nights only, Q-19).

`src/domain/guests`: `PhoneNumber` (E.164, normalized through `libphonenumber-js`, which is one tiny wrapper so the library never leaks), verification rules GV-1…GV-6 and the per phone cap as policies taking counts and `now`.

### Decision 2a. M8-T2 plan approved 2026-11-15

The owner approved the task card, approach, and recommendations. **Implemented and accepted 2026-11-15** ([evidence](../delivery/reports/m8-reservations.md#m8-t2-verification)). After review, two rules were completed in the domain: an `EXTERNAL` price snapshot carries no services and no coupon (Q-76), and the consent versions are frozen server placeholders with a pure check, `validateGuestConsent` (Q-73; the `422` mapping, persistence, and audit stay in T7).

- **Q-79, checkout:** refuse checkout on the arrival date with `INVALID_TRANSITION`, leaving state unchanged. `StayRange` and both database checks require checkout after check-in. For a later early departure, shorten the operational stay and keep the financial snapshot unchanged (Q-76). Validate nightly completeness against the priced stay at creation or repricing; do not rewrite the snapshot to fit an early departure.
- **Q-80, verification windows:** count 3 requests per phone in a rolling 15 minutes and 10 in a rolling 24 hours. No branch calendar midnight resets this global rule. Code validity remains 10 minutes and 5 attempts; verification and guest-session tokens remain 30 minutes, with booking tokens single use. The domain receives explicit time and trusted facts; hashing, constant-time comparison, token consumption, persistence, and delivery remain later application/infrastructure work.
- **Q-81, booking cap:** count `WEBSITE`, `PAY_AT_HOTEL`, `CONFIRMED` reservations whose check-in is on or after each reservation's own branch today. Count across branches and refuse a new booking at 2 existing qualifying records. Exclude staff/external reservations. The one-open-hold policy is defined without enabling M9 payment creation.
- **Domain boundaries:** build pure state transitions and checks for R-1 through R-10, reusing `LocalDate`, `StayRange`, `Occupancy`, `Money`, and existing quote rules. Distinguish input validation from facts established by later authorization, repository uniqueness, token, transaction, inventory lock, audit, and outbox code. Do not claim a pure function proves those transactional guarantees. Creation is `CONFIRMED` in M8; terminal reversals and payment/refund transitions stay out of scope.
- **References and phones:** reference encoding receives supplied random bytes; secure sourcing and collision retries are wired in later application work. Keep crypto out of the domain. `PhoneNumber` wraps the already approved, exactly pinned `libphonenumber-js`, requires international input, normalizes formatting to E.164, and rejects invalid or extension-bearing input. The dependency is pinned at 1.13.16.
- **Files and verification:** expected modules are `src/domain/reservations` (state machine, reservation checks, reference, public index), `src/domain/guests` (phone, verification and booking-cap policies, public index), matching shared types, dependency manifest/lockfile, and focused domain unit tests. Run `npm run check`, full PostgreSQL integration, applicable dedicated inventory/concurrency regression coverage, then independent review. No migration, endpoint, repository, UI, or E2E change is planned.
- **Test allocation clarification:** T-LIFE covers M8 transitions and boundaries; T-REF covers reference generation/normalization; T-PHONE covers phone validity, normalization and equality. T-VAL domain field validation belongs here; strict HTTP bodies and idempotency headers stay with the corresponding endpoint tasks (T5, T7b, T8). No contract test or endpoint is claimed by the pure domain task.

### Decision 3. Phone verification and token design

- Code: 6 digits from `crypto.randomInt`. Stored as an **HMAC-SHA-256 with a server secret** (`PHONE_VERIFICATION_SECRET`), not a bare hash, because a 6 digit code has only a million values and a database leak of bare hashes would be reversible at once. Compared in constant time.
- Verification row: id, purpose (`BOOKING` or `GUEST_SESSION`), normalized phone, code hash, attempts, expiry (10 minutes), `confirmedAt`, token hash, token expiry (30 minutes), token `usedAt`, client key hash for per client limits, `createdAt`.
- Token: 256 bit random, base64url, stored as SHA-256 hash only. A `BOOKING` token is single use. A `GUEST_SESSION` token is the 30 minute guest session for that phone.
- Attempts: P10 locks the verification row (`FOR UPDATE`) before reading `attempts`, increments it, and compares in constant time, so parallel guesses cannot pass the limit of 5. T5 tests parallel guesses.
- Limits (GV-1): 3 codes per phone per 15 minutes, 10 per day, per client limits on top, all counted in PostgreSQL (no in memory counters). Per client limits reuse the public limiter in `src/application/shared/public-rate-limit-*` with new buckets (`verification-request`, `verification-confirm`); the cleanup command `npm run throttles -- cleanup-public` learns the new bucket names.
- Identical responses: the request endpoint answers the same shape and timing class whether or not the phone has reservations or a profile. A blocked phone gets the neutral `403 PHONE_BLOCKED` (documented, Q-29). It reveals nothing about reservations.
- Delivery: the code is sent right after the verification row commits, through `WhatsAppSender`, not through the outbox (the code must never sit in a payload, and a delayed code is useless). On a delivery failure the row is invalidated and the call returns `503 VERIFICATION_UNAVAILABLE` with `Retry-After` (already in P9 and the error model). Missing setup returns `503 WHATSAPP_NOT_CONFIGURED` before any row is written.
- Verification rows are kept (data model retention, threat model); the daily and 15 minute limits read them. `npm run reservations -- expire-tokens` (M8-T6) only clears `tokenHash` on expired or used rows and the manage token hash after its expiry. It never deletes rows.

### Decision 4. Manage token and guest access

- Manage token: 256 bit random, SHA-256 hash stored on the reservation with an expiry of 30 days after check out (ADR 019). The plain link `/reservations/manage#t=<token>` is returned once in the `201` of a website booking if the P7 contract says so, and otherwise exists only in outbox payloads. **Every payload holding the link is scrubbed when the row ends `SENT` or `FAILED`.** The absolute base URL comes from the existing `APP_URL` setting. Staff and external reservations get a token only when staff send the link. Rotation (staff "resend link") replaces the hash.
- G1 reads with `Authorization: Bearer <manage token>`. G3 and G4 read with a guest session token for the verified phone. A reservation that is not that phone's returns `404`.
- Guest contact data is never returned without one of the two tokens (R-8). Tokens are never logged, never put in URLs the server sees, and never echoed back after creation.

### Decision 5. Outbox and dispatcher

- T6 storage mapping approved on 2026-11-20. In the accepted T1 schema, `kind` identifies the event, `recipient` contains the channel address, and `availableAt` controls claim eligibility. Each terminal update clears the JSON payload in the same write. Status and the empty payload record cleanup. Verification codes are never queued.
- A bounded worker claims due rows one at a time with `FOR UPDATE SKIP LOCKED`, increments the attempt count, sets a two minute lease, and commits before calling the provider. Completion checks both pending status and the claimed attempt. A crash can result in a duplicate delivery. A final expired lease records an unknown delivery outcome. SMTP uses a stable Message-ID derived from the row id.
- Retry temporary failures after 1, 5, 15, 60, and 240 minutes, with six attempts in total. Missing setup, missing templates and explicit provider rejection are permanent. Store only the failure class and a safe numeric provider code.
- The app user's cron runs `npm run reservations -- outbox` every minute and `npm run reservations -- expire-tokens` daily. A request-time kick is deferred to the booking endpoint task.
- Messages in M8: booking confirmed (email and WhatsApp), staff alert (email to the branch's contact email; no WhatsApp), booking cancelled by the hotel (when the staff member chooses to notify), manage link (resend), test. Staff created bookings send only when staff tick "send". The text always says "confirmed" only for the reservation state it was written with.
- Email: plain text plus a simple HTML part, through the existing SMTP setup, in `src/infrastructure/email`. English only, as the site is today (Q-72).

### Decision 6. WhatsApp setup

- Port `WhatsAppSender` in `src/application/notifications/ports.ts` (the module is new; the file layout follows M8-T0): `send({ purpose, language, to, variables })` returns `{ providerMessageId }` or a typed failure (`NOT_CONFIGURED`, `TEMPLATE_MISSING`, `PROVIDER_REJECTED` with sanitized provider text, `RATE_LIMITED`, `UNAVAILABLE`).
- Resolution: purpose and language resolve to the active `WhatsAppTemplate` (name, language, ordered variables from the fixed allowlist). The business number and phone number id come from `WhatsAppSettings`. The access token comes only from the server environment (`WHATSAPP_ACCESS_TOKEN`) and is never stored or returned. No active template or empty setup returns `NOT_CONFIGURED` and sends nothing.
- Adapters: `src/infrastructure/whatsapp/meta-cloud-transport.ts` (Graph API call over `fetch`, bounded timeout, sanitized errors) and `fake-transport.ts` behind a `WhatsAppTransport` port, with `TemplateWhatsAppSender` in the application layer resolving templates (as built in M8-T4; the first names `meta-cloud-sender.ts` and `fake-sender.ts` were not used) (records messages in memory for tests and in a table or file only in development). `WHATSAPP_PROVIDER=meta|fake`; the fake is refused when `NODE_ENV=production`. The Graph API version is configuration, not a constant.
- The variable allowlist is a domain constant (guest first name, reference, branch name, check in, check out, total, manage link, code, and the rest the lifecycle needs). Unknown keys return `422`.
- Online booking for a branch cannot be turned on while WhatsApp is not configured. This guard is added to the existing branch update use case, with a test.
- The test message is rate limited (5 per 10 minutes), audited, and stores its last result on the settings row.
- The minimal Admin screen `/admin/settings/whatsapp` (brief section 3, item 8) lands in M8-T4b, after the M8-T4 API (owner decision, 2026-11-18). It is the one screen in M8.

### Decision 7. Staff, external, and transition use cases

- `CreateStaffReservation`: same transaction shape as Decision 1 without verification or per phone caps, but it **still upserts and locks the guest row first** (Decision 1 order), so it cannot deadlock against a website booking. The same holds for `RecordExternalReservation`. T8 adds a race test of S3 against P7 for the same phone and listing. Source `STAFF`, `PAY_AT_HOTEL`, status `CONFIRMED`. A manual price needs `pricing:override` and a reason. Guest linking follows GV-5 (same normalized phone, or an unverified profile; staff entry never marks a phone verified).
- `RecordExternalReservation`: source `EXTERNAL`, `externalReference` required and unique per branch (R-7), amounts optional (an unpriced external booking has null snapshot columns). A conflict returns `409 INVENTORY_UNAVAILABLE` worded as a cross system conflict. No PMS entry marker.
- `CancelReservation` (unpaid only in M8; a paid reservation cannot exist yet), `ModifyReservationStay` (Q-19, PR-11, old and new locks, `412` on version mismatch, `409 PRICE_CHANGED`), `UpdateReservationGuest` (audit redacts personal fields to "changed"), `AssignPhysicalRoom` (exclusion constraint is the final guard, `409 ROOM_ALREADY_ASSIGNED`), `CheckIn`, `CheckOut` (early shortening, IN-3), `MarkNoShow`, `MarkEnteredInHotelSystem` (sets `pmsEnteredAt` once, audited, `WEBSITE` only), `ResendManageLink`.
- Lock order for a stay change: read the reservation unlocked, lock the old and new listings in id order, then lock the reservation row and re check the version. Other transitions lock the reservation row only. A change of the guest phone (S5) takes the guest row first, then the reservation row.
- Every staff transition checks `If-Match` where the contract lists it (`412` on mismatch; S14 has none), appends one audit event, and writes any message as an outbox row in the same transaction.
- Assignment (S10) takes the listing lock so `ROOM_BLOCKED` cannot race block creation; the exclusion constraint stays the final guard.
- Check out does not queue a feedback message in M8 (that is M13); it only records the transition.

### Decision 8. Error codes

Only codes already in `docs/api/error-model.md` and `api-contracts.md` are used. Known mappings: per phone cap `429 BOOKING_LIMIT_REACHED`; code could not be delivered `503 VERIFICATION_UNAVAILABLE`; WhatsApp not set up `503 WHATSAPP_NOT_CONFIGURED`; `40P01` during a room assignment `409 ROOM_ALREADY_ASSIGNED`. Any other refusal in a task card names its existing code. A code that does not exist yet needs the owner's approval in that task's plan.

### Decision 9. Carried over from M7

1. **Per phone coupon limit on public routes.** Recommended resolution (no contract change): P6 never evaluates the per phone limit, because its `phone` is unverified. The limit is enforced inside the booking transaction against the verified phone (Decision 1, step 7) and in staff quotes. A test proves an unverified `phone` never changes the P6 refusal (M7 AC-4). The alternative (an optional verification token on P6) changes a published contract and is not recommended.
2. **Slim public listing reader.** A port `PublicListingReader` (id, slug, name, accommodation type, maxAdults, maxChildren) in the `content` module, used by `QuoteBooking`, `SearchPublicAvailability`, and the new booking use case. Planned in M8-T7. P5 and P6 integration tests pass unchanged.
3. **Coupon lock and redemption count** are in Decision 1, step 7. The zero reader is replaced by a persisted reader over `CouponRedemption`.

### Decision 10. Migration `reservations`

One additive migration, then repositories (M8-T3). Tables as in `docs/database/data-model.md`: `WhatsAppSettings` (singleton row, number empty), `WhatsAppTemplate`, `Reservation`, `ReservationRoom`, `ReservationNight`, `ReservationService`, `CouponRedemption`, `Guest`, `PhoneVerification`, `NotificationOutbox`, `BranchSyncCheckpoint`. SQL only parts: `btree_gist` extension, the double assignment exclusion constraint (ADR 016, with the fallback in ADR 022 if the provider refuses the extension), `UNIQUE NULLS NOT DISTINCT` on the idempotency key (with the data model's predicate so rows without a key do not collide), composite foreign keys for branch ownership, no `PENDING` or `DECLINED` anywhere. The singleton `WhatsAppSettings` row is created in the migration, like `CommercialSettings`. Demo seed (`prisma/seed/demo.ts`, `--demo` only): reservations in every status that M8 can produce, a blocked guest, a coupon redemption, unentered and entered website bookings, sync history, and demo templates with obviously fake names. Non demo seed adds no templates (names come from Meta, so none are invented).

### Decision 11. Authorization

Capabilities already exist and are used as listed in the API document: `reservations:read`, `:create`, `:record-external`, `:modify`, `:cancel`, `:front-desk`, `:pms-entry`, `guests:read`, `guests:block`, `settings:edit` (WhatsApp, Admin only). Personal data in staff lists and details appears only with `guests:read`. Branch scope is enforced in the use case through `authorizeBranch`; a branch the user is not assigned to returns what the contract of that endpoint says (`404` for a resource id, `403` where the branch is in the path, as S20 and S35 already do); the task card names it per endpoint. Blocking a guest is global, needs `guests:block`, takes the guest row lock, and invalidates the phone's open verifications (S52). Public endpoints derive the branch from the server (`branchSlug` resolved to an active branch with online booking enabled) and never trust a client branch id.

### Decision 12. Logging and personal data

Application and infrastructure code never logs a guest name, email, phone, code, token, or request body. Audit events for guest edits store field names only. The captured log test (AC-8) runs each public use case with distinctive personal values and asserts none appear in any log line or error `detail`.

### Decision 13. New configuration and dependencies

| Item | Why | Needs approval |
| --- | --- | --- |
| `libphonenumber-js` (exact version, `save-exact`) | E.164 parsing and validation (ADR 019). Never parse phone formats by hand | **Yes (new dependency)** |
| `PHONE_VERIFICATION_SECRET` | Keyed hash of codes | Env var, documented, required in production |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PROVIDER`, `WHATSAPP_GRAPH_VERSION` | Meta adapter and fake switch | Env vars, documented |
| `npm run reservations -- outbox` and `expire-tokens` | Dispatcher and cleanup | New CLI, run by the app user cron |

No other new dependency is planned.

### Value sourcing

| Value an action needs | Source |
| --- | --- |
| Branch of a public booking | `branchSlug`, resolved on the server to an active branch (never a client id) |
| Branch today (per phone cap, check in, no show, short stay) | `localDateAt(clock.now(), branch.timeZone)` |
| Nightly prices, services, VAT rate | Server: `NightlyPriceResolver`, service table, `CommercialSettings`; nothing from the client except `expectedTotal`, which is only compared |
| Guest phone for a website booking | The verified phone on the consumed token, never a body field |
| Reservation reference and manage token | Server random sources (Decisions 2 and 4) |
| Staff alert recipient | The branch contact email (`Branch.email`); no recipient means the alert is skipped and logged as a setup gap without personal data |
| Idempotency scope | Public client constant for website bookings, the staff user id for staff bookings |
| `pmsEnteredById` | The authenticated actor |
| Coupon per phone count | Persisted `CouponRedemption` rows of unreleased redemptions for the verified phone |
| Sync status counts | Reservations with source `WEBSITE`, status `CONFIRMED` or `CHECKED_IN`, `pmsEnteredAt` null (Q-77) |

### Edge cases

| Case | Handling |
| --- | --- |
| Same idempotency key, same body, repeated or parallel | One reservation; all answers carry its reference (C-9); the token is not returned again |
| Same key, different body | `422 IDEMPOTENCY_KEY_REUSED` |
| Verification token reused or for another phone | Refused; the first use wins under the token row lock |
| Rollback after token consumption | Token is not consumed (same transaction) |
| Two parallel bookings by one phone at the cap | Guest row lock lets one pass; the other is refused |
| Lock timeout | `503 TRY_AGAIN` with `Retry-After` |
| Outbox send fails | Retry with backoff; reservation unaffected; row ends `FAILED` after six attempts and is visible |
| Dispatcher crash after provider accepted | Possible duplicate send (at least once); documented, rare |
| Stay change under version mismatch | `412`, nothing written |
| Cancellation of a `CHECKED_IN` or terminal reservation | Refused by the state machine with the documented conflict error |
| Check in without an assigned unit per line, or before check in date | Refused |
| Staff touch another branch | `404`, no data |
| WhatsApp not configured | `503 WHATSAPP_NOT_CONFIGURED` for verification; branch cannot enable online booking |
| Blocked phone | No code, neutral `403`; an existing verification is invalid |
| Coupon released on cancel | Redemption marked released in the same transaction (Q-57) |

### Test plan

Unit: T-LIFE-1…10, T-REF-1…3, T-PHONE-1…4, T-VAL-1…5, T-AUTHZ-2. Integration (real PostgreSQL): T-DB-6…8, T-RES-1…12, T-PMS-1…2, T-GST-1…10, T-LKP-1…4, T-NTF-1…3, T-WA-1…7, T-AUD-1…3, T-SYNCAPI-1…4, T-HTTP-1…10. Concurrency, each repeated 20 times: C-1…C-3, C-5…C-7, C-9…C-11, and C-4 extended to block against booking (the tests follow `tests/integration/reservations/AGENTS.md`). The authorization sweep (AC-9) and the captured log test (AC-8) are extended by **every** task that adds a use case or handles personal data, including the dispatcher; T8 and T7b create them, they are not owned by one task. E2E and axe cover `/admin/settings/whatsapp` only. Each task also runs the gates for its tier ([quality-gates.md](../testing/quality-gates.md#gates-per-task)).

## Options considered

| Decision | Chosen | Rejected |
| --- | --- | --- |
| Per phone caps under concurrency | Lock the guest row | Advisory locks (harder to test and reason about); counting without a lock (races) |
| Code storage | Keyed HMAC | Bare SHA-256 (reversible at 10^6 values) |
| Verification code delivery | Direct send after commit | Outbox (stores the code, adds delay) |
| P6 per phone limit | Do not evaluate it publicly | Optional token on P6 (changes a published contract) |
| Outbox trigger | Cron every minute, plus optional `after()` kick | A long running in process worker (a second moving part) |
| Enum values for M9 | Keep `PAYMOB`, `AWAITING_PAYMENT`, `PAYMENT_FAILED` in the schema, unreachable in M8 | Add them in M9 (an extra migration for no gain) |

## Rationale

All coordination stays in PostgreSQL (ADR 016, ADR 022). Messages follow the commit, so a message never describes a rolled back state (ADR 024, R-10). Tokens and codes are hashed with keys that match their guessability. The adapters sit behind ports, so the fake adapter completes the milestone and the real provider can be switched without touching use cases.

## Consequences

- The availability reader, `QuoteBooking`, and the sync status reader start reading real data; their zero adapters are deleted.
- `docs/database/integrity-and-concurrency.md` gains the guest row as the first lock level, and the new migration, OpenAPI, API contracts, test matrix, and data model get Implemented marks as tasks land.
- RK-1 (cross system double booking) is live with this milestone; the PMS entry marker exists in the API, and its screens arrive in M11.
- A new deploy duty: the outbox cron every minute and the token cleanup.

## Task breakdown (confirmed with changes)

Changes against the brief's table are marked **changed**. Brief ids stay.

| Task | Title | Risk | Depends on | Covers | Status |
| --- | --- | --- | --- | --- | --- |
| M8-T0 | Application ports consolidation | Medium | M7 | | Accepted |
| M8-T0b | Public surfaces for the CMS modules | Medium | T0 | D-8 test extended | Accepted |
| M8-T1 | Migration `reservations`, constraints, seeds | Critical | T0 | T-DB-6…8 | Accepted |
| M8-T2 | Reservation and guest domain (state machine, R-1…R-10, reference, `PhoneNumber`, verification and per phone policies). Includes the `libphonenumber-js` dependency if approved | Critical | T0 | T-LIFE, T-REF, T-PHONE, T-VAL | Accepted |
| M8-T3 | Reservation and guest repositories, unit of work binding, **real sold consumption adapter** | Medium | T1 (and T0b) | repository integration tests | Not started |
| **M8-T3b** (new, 2026-11-17) | Airport transfer car count: migrations `transfer_vehicle_unit` and `transfer_vehicles`, SV-5, P6 `services` objects, S35/S36 `maxVehicles`, T3 repository mapping (Q-82, Q-90) | Critical | T3, M7 | AC-11, T-SVC-VEH-1…6 | Accepted |
| M8-T4 | WhatsApp setup (settings, templates, sender port, adapters, test message, API A6 to A8, minimal Admin screen, branch enable guard; **changed 2026-11-17:** the purpose allowlist also holds `RESERVATION_MODIFIED`, `CHANGE_REQUEST_RECEIVED`, `CHANGE_REQUEST_APPROVED`, `CHANGE_REQUEST_REJECTED`, Q-84) | Critical | T1, T2 | AC-10, T-WA-1…7 | Not started |
| M8-T5 | Phone verification, API P9 and P10 | Critical | T2, T3, T4 | AC-7, T-GST (verification) | Not started |
| M8-T6 | Notifications: outbox, dispatcher, email templates, `reservations` CLI, token expiry job | Critical | T3, T4 | AC-4 (messages), T-NTF-1…3 | Accepted (2026-11-20) |
| M8-T7 | `CreateWebsiteReservation` use case: persistence, caps, coupon lock, redemption, guest upsert, audit, outbox, `PublicListingReader` | Critical | T3b, T5, T6, M7 | AC-1 to AC-4, T-RES, C-1…C-3, C-11 | Accepted (2026-11-20) |
| **M8-T7b** (new) | Public API P7, idempotency replay over HTTP, P6 per phone limit change, OpenAPI, captured log test, mid milestone security review | Critical | T7 | AC-1, AC-8, T-HTTP, C-9 | Accepted (2026-11-20) |
| M8-T8 | Staff and external reservations (S3, S4) **and the reads S1, S2, S15** (changed: the brief assigns these three endpoints to no task) | Critical | T7 | AC-9, T-RES, T-AUTHZ-2, C-5, C-8 | Not started |
| M8-T9 | Inventory changing transitions: staff cancellation with coupon release, stay modification (S6, S9); **changed 2026-11-17:** built as the shared change engine `ModifyReservation` with migration `reservation_changes` (`ReservationChange`, `pmsUpdatePendingSince`), and S55 (Q-83, Q-84) | Critical | T8 | AC-6, AC-12, C-4, C-10, T-CHG-1…4 | Not started |
| **M8-T9b** (new, 2026-11-17) | Service changes through the change engine (S6 `services`: add, remove, car count, flight details; PR-11) | Critical | T9, T3b | AC-12, T-CHG-5…7 | Not started |
| M8-T10 | Operational transitions (S5, S10 to S14, S16) | Critical | T8 | AC-5, T-PMS, C-7, C-9 | Not started |
| M8-T11 | Guests and guest access (S50 to S53, G1, G3, G4) | Critical | T5, T7b | AC-7, T-GST, T-LKP | Not started |
| M8-T12 | Sync status and checkpoints API (S28, S29), replaces the null checkpoint reader | Medium | T7 | T-SYNCAPI-1…4 | Not started |

Notes on the changes:

- **T7b is a recommended split.** T7 as the brief wrote it combines the largest transaction in the system with the HTTP surface, idempotency, the log proof, and the P6 change. Split, each half is reviewable in one sitting. If you prefer one task, T7 keeps both and is planned as two stages.
- **Reads S1, S2, S15 added to T8**, because T8 already builds the staff reservation DTO and S2 supplies the `ETag` for `If-Match`. If T8 proves too large at planning, S1 and S15 move to their own task.
- **C-5 and C-8 moved to T8, C-7 and C-9 to T10, and C-10 stays in T9** (changed against the brief). T4 now also depends on T2 for E.164, and its repositories follow the same T0b rule as T3.
- **T10 depends on T8 only**; C-7 (double assignment) is its concurrency test. T9 and T10 can be accepted in either order.
- **Mid milestone security review** (tokens, verification, logs) is placed after T7b, when codes, tokens, and the log test all exist. T11 gets a focused re review of the guest tokens inside its own review.
- **WhatsApp screen**: the brief's "Out of scope: any screen" and its in scope Admin screen conflict on a plain reading. This spec treats the Admin WhatsApp screen as the one explicit exception. Confirm below.
- **T0b before T3** stays as the brief says, so the new modules and the old ones share one rule. It does not block T1 or T2.
- No task covers API-S17 to S19, S44, S45, S60 to S62, or S54; those belong to M9 and M13.

### Decision 14. Scope added on 2026-11-17 (Q-82…Q-85, Q-90)

- **Car count (M8-T3b, accepted 2026-11-17).** `services` items become `ServiceInput` (a bare kind or `{ kind, vehicles?, details? }`), so the M7 contract keeps working. `vehicles` is stored on `ReservationService` for every transfer unit; only `PER_VEHICLE` multiplies. `maxVehicles` lives on the branch's transfer offering. Placed after T3 because T3 was already implemented; T3b extends the T3 repository mapping rather than reopening T3.
- **One change engine (M8-T9, T9b).** `ModifyReservationStay` becomes `ModifyReservation`: a pure `ReservationChangePlan` (domain) compares the current reservation with a requested change and lists the changed nights, lines, and services; the use case loads prices and inventory under the old and new listing locks (Decision 1 lock order), applies PR-11, writes a `ReservationChange` row (actor kind, before and after summaries without personal values, totals), the audit event, and the outbox rows, and sets `pmsUpdatePendingSince` when `pmsEnteredAt` is set. The staff entry point checks `reservations:modify`; M9-T10 adds the guest entry point (deadline, own reservation, no override, forbidden keys) on the same engine, and M9-T11 the change-request path.
- **Messages.** The WhatsApp purpose allowlist and the email templates gain `RESERVATION_MODIFIED` in M8 (staff changes can notify the guest when staff tick "send"), and the three change-request purposes, so M9 needs no allowlist change.

## Follow-up

- `docs/domain/reservation-lifecycle.md`, `docs/api/api-contracts.md`, `docs/database/*`, `docs/testing/test-matrix.md`, and the OpenAPI file get their Implemented marks task by task (Stage 7).
- The mid milestone security review file is `docs/reviews/<date>-m8-security.md`.
- Add `tests/integration/reservations/AGENTS.md` updates if a new convention appears (via `/sync`).

## References

None (sources are the project documents cited above).

## Decisions for the owner (all accepted as recommended, 2026-11-14)

1. Spec and task table approved, including the T7b split and S1, S2, S15 added to T8.
2. `libphonenumber-js` approved as a new dependency, pinned exactly (added in M8-T2).
3. The guest row is the first lock level (Decision 1). `integrity-and-concurrency.md` is updated in M8-T7.
4. Public P6 stops evaluating the per phone coupon limit. No token field is added to P6.
5. The staff alert goes to the branch contact email.
6. The Admin WhatsApp screen is the one M8 screen.
7. The per phone cap error code is the existing `429 BOOKING_LIMIT_REACHED` (corrected after the cross check; no new code).

## Owner answers to the cross check questions (approved 2026-11-14)

Recorded in the question register as Q-71 to Q-78. They are binding for the tasks named there.

1. **WhatsApp configured (Q-71)**: number, phone number id, server token, and an active `en` template for both verification code and booking confirmed. Other purposes are setup gaps. Clearing the number is allowed; P9 then returns `503 WHATSAPP_NOT_CONFIGURED` and P7 `409 BRANCH_NOT_BOOKABLE`.
2. **Language (Q-72)**: `en` from configuration, no column.
3. **Consent versions (Q-73)**: server constants, placeholders until Q-30 and Q-58 text is approved; a mismatch is a `422` field error. A new opt in clears an earlier opt out and is audited.
4. **P7 and P9 (Q-74)**: `PAYMOB` returns `409 PAYMENT_METHOD_UNAVAILABLE`; a filled honeypot returns a generic `422` and writes nothing; per client limits 10 per hour (P9) and 20 per 10 minutes (P10), as new public limiter buckets.
5. **Blocked phone (Q-75)**: guest sessions stop at once; the manage link keeps working, view only.
6. **Money (Q-76)**: stay change uses current rates for changed nights, the stored VAT rate, and the kept coupon recomputed (percent on the new subtotal, fixed capped); override needs `pricing:override`. Early check out leaves the snapshot unchanged. External amounts are all nights or none, in the ADR 027 order with VAT at the current rate. A staff override replaces nightly amounts only.
7. **Sync (Q-77)**: count `WEBSITE`, `pmsEnteredAt` empty, `CONFIRMED` or `CHECKED_IN`. `dueAt` from the last `COMPLETED` plus the interval, or a newer `STARTED` plus the follow up delay; no checkpoint means due now.
8. **Per phone cap (Q-78)**: across all branches, each reservation judged by its own branch today.
