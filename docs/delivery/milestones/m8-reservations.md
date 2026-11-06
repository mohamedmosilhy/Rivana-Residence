# M8 — Reservations, immediate confirmation, phone verification, and messages

Status: **Not started.** Branch: `m8-reservations`. Follow the [milestone loop](./README.md#the-loop-every-milestone-follows).

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

## Tasks

### 1. Database (migration `reservations`)

Tables as in [data-model.md](../../database/data-model.md): `WhatsAppSettings` (singleton, number empty), `WhatsAppTemplate`, `Reservation` (status enum without `PENDING`/`DECLINED`, price snapshot columns, `vatRateBasisPoints`, `couponId`, `couponCode`, `pmsEnteredAt`, `pmsEnteredById`, `paymentMethod` enum with `PAY_AT_HOTEL` and `PAYMOB`, `paymentStatus` enum), `ReservationRoom` (several per reservation, same stay), `ReservationNight`, `ReservationService`, `CouponRedemption`, `Guest` (with `marketingOptInAt`, `marketingConsentVersion`, `marketingOptOutAt`), `PhoneVerification`, `NotificationOutbox`, `BranchSyncCheckpoint`; checks, composite FKs, the double-assignment exclusion constraint, `UNIQUE NULLS NOT DISTINCT` idempotency key.

### 2. Domain (`src/domain/reservations`, `src/domain/guests`)

1. `ReservationStateMachine` with the states and transitions in the lifecycle document (create → `CONFIRMED` for website pay-at-hotel, staff, and external; cancel; check in; check out with early shortening; no-show). Pure, given branch "today".
2. Reservation invariants R-1…R-10; `ReservationReference` generator rules; `PhoneNumber` (E.164 via `libphonenumber-js`, confirm the dependency in the spec); verification rules GV-1…6; per-phone caps (Q-60) as a policy.

### 3. Application

1. `CreateWebsiteReservation` (pay at hotel) in one unit of work: idempotency lookup → consume verification token (phone matches, not blocked) → per-phone cap check → expire overdue payment holds for these listings (no-op until M9) → lock listings in id order → availability for each line's units → nightly prices → services → lock coupon row and count redemptions → `QuoteCalculator` → compare with `expectedTotal` (`409 PRICE_CHANGED` with the new quote) → insert reservation `CONFIRMED`, lines, nights, services, redemption → upsert guest (latest name and email; marketing opt-in if ticked, with wording version) → audit → outbox (email and WhatsApp confirmation, staff alert) → commit.
2. `CreateStaffReservation` (`CONFIRMED`, pay at hotel, optional coupon and services, manual price needs `pricing:override`), `RecordExternalReservation`.
3. Transitions: `CancelReservation` (staff; unpaid only in M8), `ModifyReservationStay` (re-quote changed nights, services kept, VAT recomputed, old and new totals; Q-19), `UpdateReservationGuest`, `AssignPhysicalRoom`, `CheckIn`, `CheckOut` (early shortening), `MarkNoShow`, `MarkEnteredInHotelSystem` (`reservations:pms-entry`; sets `pmsEnteredAt` once, audited), `ResendManageLink`.
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

Report, then stop. M9 has not started.
