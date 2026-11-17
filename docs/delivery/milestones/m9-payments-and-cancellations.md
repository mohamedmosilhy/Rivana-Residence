# M9 — Paymob payments, payment holds, cancellation requests, and refunds

Status: **Not started.** Scope extended by the owner on 2026-11-17 with guest booking changes (M9-T10, T11; Q-83…Q-85). Branch: `m9-payments-and-cancellations`. Follow the [milestone loop](./README.md#the-loop-every-milestone-follows).

## Objective

Guests can pay online through Paymob's hosted checkout or choose pay at the hotel. An online booking holds its inventory for about 15 minutes in `AWAITING_PAYMENT` and becomes `CONFIRMED` **only** when a verified Paymob success result arrives. Guests request cancellations until 24 hours before the branch's check-in time on the arrival date; a Manager of the branch or an Admin approves or rejects; approved paid bookings are refunded through Paymob's refund API and become `CANCELLED` when Paymob confirms.

## Read first

- ADRs [025](../../adr/025-paymob-online-payment.md), [024](../../adr/024-immediate-confirmation.md), [016](../../adr/016-inventory-and-concurrency.md)
- [domain/reservation-lifecycle.md](../../domain/reservation-lifecycle.md) (payment and cancellation-request sections; PY and CX rules)
- [database/data-model.md](../../database/data-model.md) (`Payment`, `PaymentEvent`, `CancellationRequest`)
- [database/integrity-and-concurrency.md](../../database/integrity-and-concurrency.md) (C-12…C-14)
- [api/api-contracts.md](../../api/api-contracts.md) (P7 online path, P8, G2, G4, S9, S17–S19, S44, S45)
- [security/threat-model.md](../../security/threat-model.md) (payments, guest change abuse)
- Guest changes: [domain/reservation-lifecycle.md](../../domain/reservation-lifecycle.md#guest-changes-q-83q-85) (GC-1…6), FR-GCHG, API G5, G6, S56–S58, C-16, C-17; the M8-T9 change engine (spec 0005, Decision 14)
- Paymob's current developer documentation for hosted checkout (intention or order API), transaction callbacks and HMAC calculation, and refunds. Record in the spec which Paymob API version and fields are used; do not rely on memory.

## Blocking questions (must be answered before starting)

- Q-54 (decided): the Paymob account charges **USD**.
- Q-55 (decided): the client sends the **sandbox keys** (API key or secret key, HMAC secret, integration ids) when this milestone starts, and the live keys before launch. They go into server environment variables only. **Do not start M9 until the sandbox keys have arrived**; ask the owner for them at the start.
- Q-62 ★, Q-63, Q-65 ★, Q-66 ★: recommendations accepted unless answered.

## Skills for this milestone

| Step | Skill | Notes |
| --- | --- | --- |
| Spec | `/architect` (`FEATURE`) | `PaymentGateway` port, callback processing, hold expiry, refund state machine, verified against Paymob docs |
| Build | `/develop` (logic track) | Fake gateway first, then the Paymob adapter |
| Tests | `/test` | Callback forgery, duplicates, late success, refund failure |
| Failures | `/debug` | |
| Proof | `/check verify` | Full sandbox run: pay, fail, abandon, refund |
| Review | `/check review` | Focus: HMAC verification, amount and currency checks, idempotency, no card data, secrets |
| After merge | `/sync` | Record payment conventions in `AGENTS.md` |

## In scope

Online payment path, holds and expiry, callback endpoint, reconciliation job, late-success handling, cancellation requests, staff decision API, refunds and retry, paid staff cancellation, messages for each outcome. Added 2026-11-17: guest booking changes through the M8 change engine, applied at once for pay-at-hotel bookings (M9-T10) and as change requests for paid bookings whose total changes (M9-T11).

## Out of scope (binding)

- Screens (M10, M11). Partial refunds (Q-66). A second online payment for a guest change (Q-85). Payment links for staff bookings (Q-37: staff bookings are pay at hotel). Embedding a card form or Paymob iframe on Rivana pages. Storing any card data.

## Task breakdown

Planned, reviewed, and accepted one task at a time ([agent-workflow.md](../../engineering/agent-workflow.md)). Rows are confirmed at milestone open; the numbered **Tasks** below hold the detail.

| Task | Title | Risk | Depends on | Covers (criteria, tests) | Status |
| --- | --- | --- | --- | --- | --- |
| M9-T0 | Public surface for `src/application/auth`: one `index.ts` and D-8 extended to it (refactor, no behavior change; recommended in the M8-T0b review package, owner decision 2026-11-14) | Medium | M8 | Existing tests unchanged and green; D-8 test extended | Not started |
| M9-T1 | Migration `payments_and_cancellations` | Critical | — | drift check | Not started |
| M9-T2 | Domain: payment transitions, `CancellationDeadline`, PY and CX rules | Critical | — | T-PAY-1…4, T-CXL-1…3 | Not started |
| M9-T3 | `PaymentGateway` port, fake adapter, Paymob adapter (server-only) | Critical | — | AC 9; adapter tests, bundle check | Not started |
| M9-T4 | Online booking path: `AWAITING_PAYMENT`, hold, checkout creation, gateway failure | Critical | T1, T2, T3 | AC 1, 4; T-PAY-5 | Not started |
| M9-T5 | Payment callback: `webhookRoute`, HMAC, idempotency, late success (API P8) | Critical | T4 | AC 1–3, 5; C-12, C-13, webhook handler tests | Not started |
| M9-T6 | Hold expiry and payment reconciliation jobs | Critical | T5 | AC 4, 5; C-14 | Not started |
| M9-T7 | Guest cancellation requests (G2, G4) | Critical | T1, T2 | AC 6; T-CXL-4…5 | Not started |
| M9-T8 | Cancellation decisions and refunds: decide, refund, retry, paid staff cancellation (S9, S17–S19, S44, S45) | Critical | T5, T7 | AC 7, 8; T-PAY-8…10, T-CXL-6…8 | Not started |
| M9-T9 | Payment, cancellation, and change messages (email and WhatsApp templates, including booking changed and change request received, approved, rejected) | Medium | T5, T8, T10, T11 | message content tests | Not started |
| M9-T10 | Guest changes, pay-at-hotel bookings: `PreviewGuestChange`, `ApplyGuestChange` on the M8 change engine; deadline, forbidden keys, open-request and blocked-phone refusals; API G5, G6 (manage token and guest session); limits; OpenAPI (Q-83, Q-84) | Critical | M8-T9b, M8-T11, T2 | AC 11; T-GCHG-1…8, C-16 | Not started |
| M9-T11 | Change requests for Paymob-paid bookings: same-total changes at once; other changes stored as `ChangeRequest` (migration `change_requests`), decided in the cancellation queue (S56–S58) with inventory and price re-check (Q-85) | Critical | T10, T8 | AC 12; T-GCHG-9…12, C-17 | Not started |

AC 10 (the Paymob sandbox run) is recorded at milestone close.

## Tasks

### 0. Prerequisite task (M9-T0): public surface for `auth`

Owner decision 2026-11-14, from the M8-T0b review package. Same shape as [M8-T0b](./m8-reservations.md#0b-follow-up-task-m8-t0b-public-surfaces-for-the-cms-modules): a refactor with **no behavior, schema, API, or contract change**. Done first so the M9 use cases (which all authorize) import `auth` through its index from the start.

1. **Objective.** `src/application/auth/index.ts` exports exactly the symbols used outside the module (`authorize`, `authorizeBranch`, the auth ports and types, `return-path`, `sign-in`), and every outside import (about 97 at M8-T0b, more after M8) goes through it.
2. **Scope in.** The index; rewriting importers (import lines only); adding `auth` to the application-only D-8 list in `tests/unit/architecture/module-boundaries.test.ts` and `eslint.config.mjs`; the D-8 row in `docs/architecture/dependency-rules.md`. `src/domain/auth` is included only if the plan shows it is equally simple.
3. **Watch.** `return-path` may be used by client components: keep those imports type only, or confirm the exported helper is pure and pulls no server code (D-13). Check for runtime cycles, since almost every module imports `authorize`.
4. **Acceptance.** Same as M8-T0b: moves only (import-stripped comparison), gates with unchanged counts plus the new D-8 cases, mutation checks, `openapi.json` unchanged.
5. **Risk.** Medium.


### 1. Database (migration `payments_and_cancellations`)

1. `Reservation.holdExpiresAt`; status values `AWAITING_PAYMENT` and `PAYMENT_FAILED` (if not created in M8).
2. `Payment` (reservation, provider `PAYMOB`, merchant reference, provider order or intention id, provider transaction id, amount, currency, status `INITIATED | SUCCEEDED | FAILED | REFUND_PENDING | REFUNDED | REFUND_FAILED`, refund provider id, timestamps).
3. `PaymentEvent` (payment, provider event or transaction id unique, verified flag, received at, minimal non-sensitive payload excerpt).
4. `CancellationRequest` (reservation, requested at, requested by `GUEST`, reason, status `OPEN | APPROVED | REJECTED | REFUND_PENDING | REFUND_FAILED | COMPLETED`, decided by, decided at, decision reason). At most one `OPEN` request per reservation (partial unique index).

### 2. Domain

1. State machine additions: `AWAITING_PAYMENT → CONFIRMED` (verified success), `AWAITING_PAYMENT → PAYMENT_FAILED` (failure or expiry), `CONFIRMED → CANCELLED` via an approved request or a staff cancellation (refund first when paid).
2. `CancellationDeadline.for(branch, checkIn)`: the instant 24 hours before `checkIn` at the branch's `checkInTime` in the branch time zone (CX-1); a reservation without a branch check-in time cannot be requested online.
3. Payment and refund rules PY-1…8, CX-1…7.

### 3. Application and infrastructure

1. `PaymentGateway` port: `createCheckout({ paymentId, amountMinor, currency, reference, customer, expiresAt, returnUrl })` → `{ checkoutUrl, providerIds }`; `verifyCallback(rawBody, headers or query)` → verified event or rejection; `getTransaction(providerId)`; `refund({ providerTransactionId, amountMinor })` → pending, succeeded, or failed.
2. Paymob adapter in `src/infrastructure/payments/paymob/` (server-only, secrets from environment: API key or secret key, public key if needed, HMAC secret, integration ids). Fake adapter for tests and local runs.
3. `CreateWebsiteReservation` online path: same transaction as M8 but status `AWAITING_PAYMENT`, `holdExpiresAt = now + 15 min`, no confirmation messages; after commit `createCheckout`; a gateway failure marks the reservation `PAYMENT_FAILED` (releases inventory and coupon) and returns `503 PAYMENT_UNAVAILABLE`.
4. `ProcessPaymentCallback` (via `webhookRoute`): verify HMAC → record `PaymentEvent` once → lock reservation → check amount and currency equal the payment → success: `CONFIRMED`, payment `SUCCEEDED`, outbox confirmation messages; failure: `PAYMENT_FAILED`, release; late success after expiry: re-lock listings, re-check availability, confirm or refund automatically and alert staff (Q-63). Always respond `200` to a verified event once recorded, so Paymob stops retrying; respond `401` to an unverified one.
5. `ExpirePaymentHolds` job (`npm run reservations -- expire-holds`, every minute) and in-transaction expiry for the same listings during bookings.
6. `ReconcilePayments` job (every 5 minutes): for `INITIATED` payments past expiry with no event, query `getTransaction` and process the result.
7. `RequestCancellation` (guest, manage token or guest session; before the deadline; `CONFIRMED` only; one open request).
8. `DecideCancellationRequest` (`cancellations:decide`, branch-scoped): reject with reason (booking stays `CONFIRMED`); approve unpaid → `CANCELLED`, release; approve paid → refund through the gateway → on success `CANCELLED` and release, on pending wait for the refund callback, on failure `REFUND_FAILED` with retry (`RetryRefund`).
9. Staff cancellation of a paid booking: Manager and Admin only (Q-62), same refund path.
10. Messages (email and WhatsApp transactional templates): payment failed or expired (no "confirmed" wording), cancellation request received, approved (with refund status), rejected (with reason), refund completed, automatic refund after a late success; booking changed (old and new details and totals), change request received, approved, rejected (with reason).
11. **Guest changes, pay at hotel (M9-T10, Q-83, Q-84).** `PreviewGuestChange` (no write) and `ApplyGuestChange` call the M8 `ModifyReservation` engine through a guest entry point: the reservation comes from the manage token or the guest session (same phone), never from the body; GC-1 forbidden keys (`422`); GC-2 refusals as `403 CHANGE_NOT_ALLOWED` with a reason (deadline on current and new arrival, open request, blocked phone, status); `If-Match` and `expectedTotal`; PR-11 pricing (added services at current offering, coupon kept per Q-76); change history (actor `GUEST`), audit, outbox (`RESERVATION_MODIFIED` to the guest; staff alert), hotel-system flag. Confirm in the plan whether an email change also notifies the old address (threat model). Limits per client and per reservation.
12. **Change requests, paid bookings (M9-T11, Q-85).** When the reservation is `PAYMOB` and paid, `ApplyGuestChange` applies a same-total change at once; otherwise it stores an `OPEN` `ChangeRequest` (requested change, previewed total; no inventory held; one open request of either kind per reservation, checked under the reservation row lock) and returns `202`. `DecideChangeRequest` (`cancellations:decide`, branch scoped): reject with reason; approve re-runs the engine under the locks and applies the change (change history links the request) or leaves the request `OPEN` with the conflict recorded. The difference is settled at the desk (Q-66); no refund or second payment.

### 4. API

P7 online path (`201 { reference, status: "AWAITING_PAYMENT", checkoutUrl, holdExpiresAt, manageUrl }`), P8 callback, G2 and G4 cancellation requests, S9 paid path, S17 list requests, S18 approve, S19 reject, S44 payments of a reservation, S45 retry refund. Added 2026-11-17: G5 change preview, G6 apply change (both via manage token and guest session), S56 list change requests, S57 approve, S58 reject.

## Database impact

Additive migrations: `payments_and_cancellations`, and `change_requests` (M9-T11).

## API impact

As listed; the callback endpoint is documented in OpenAPI as a webhook.

## Acceptance criteria

1. An online booking is `AWAITING_PAYMENT` with a checkout URL; no confirmation message exists until a verified success is processed; then it is `CONFIRMED` with confirmation messages queued in that transaction.
2. A callback with a bad HMAC, a different amount or currency, or an unknown payment changes nothing and is logged without payload data.
3. A duplicate verified callback changes nothing (idempotent) (C-13).
4. A failed payment or an expired hold makes the reservation `PAYMENT_FAILED`, releases its inventory and coupon redemption, and sends no confirmation.
5. A booking racing an expiring hold for the last unit never oversells (C-14); a late success after the unit was resold triggers an automatic refund and staff alert (C-12).
6. A cancellation request before the deadline is created; after the deadline it returns `409 CANCELLATION_WINDOW_CLOSED` with the branch contact details; a second open request returns `409 CANCELLATION_REQUEST_EXISTS`.
7. Only a Manager of the branch or an Admin can decide a request; rejection keeps the booking `CONFIRMED` and messages the reason; approval of a paid booking calls the refund API with the captured amount and sets `CANCELLED` only after Paymob confirms; a refund failure is visible and retryable.
8. Receptionists cannot cancel a paid booking.
9. No card number, CVV, or full Paymob payload is stored or logged; secrets are server-only (bundle check).
10. A sandbox run against Paymob test mode covers success, failure, abandonment, and refund, recorded in the report (or explicitly not run, with the reason, if credentials were not available).
11. A guest change to a pay-at-hotel booking before the deadline applies at once with the previewed total, writes one change-history row, one audit event, and the guest and staff messages, and flags a booking already entered in the hotel system; after the deadline, with an open request, for a blocked phone, with a stale version, or with a forbidden key nothing changes; a change racing a booking for the last unit never oversells (C-16).
12. A change to a paid booking that alters the total creates one `OPEN` change request and holds nothing; only a Manager of the branch or an Admin decides it; approval re-checks inventory and prices and applies the change or records the conflict (C-17); no Paymob call is made.

## Tests

- Unit: T-PAY-1…4 (state transitions, amount checks, deadline computation across time zones and DST), T-CXL-1…3.
- Integration: T-PAY-5…10 (fake gateway: checkout creation failure, callback verify, duplicate, late success, reconciliation, refund pending, failed, retry), T-CXL-4…8 (request rules, decisions, authorization, audit), webhook Route Handler tests (raw body, `401`, `200`).
- Integration (added 2026-11-17): T-GCHG-1…12 (preview, apply, every refusal, PR-11 money, history, audit, outbox, flag, authorization through both guest credentials, change requests and decisions).
- Concurrency: C-12, C-13, C-14, C-16, C-17.

## Evidence for the report

Sandbox transaction ids (no personal data); state diagrams as exercised; callback verification tests; refund flow walk-through.

## Risks

- Keys not yet supplied (Q-55): stop and ask the owner before building against Paymob.
- Lost callbacks: the reconciliation job.
- Refund API latency or failure: explicit states and retry.

## Handoff

Close the milestone ([README steps 8–15](./README.md#the-loop-every-milestone-follows)), report, then stop. M10 has not started.
