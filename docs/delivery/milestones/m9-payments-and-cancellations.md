# M9 — Online payments (provider neutral), payment holds, cancellation requests, refunds, and email verification

Status: **In progress** (6/14 tasks accepted. M9-T4 was accepted on 2026-11-24.) Spec [0006](../../specs/0006-m9-payments-and-cancellations.md) and the task breakdown were approved on 2026-11-22 with Q-94…Q-97 and decisions D-A…D-E. M9-T9 merged into the tasks that send each message. The owner extended scope on 2026-11-17 with guest booking changes (M9-T10, T11, Q-83…Q-85), and on 2026-11-22 with provider neutral integrations (M9-T0b, T3, Q-92, ADR 030) and email verification as a fallback to WhatsApp (M9-T12, Q-93, ADR 031). Branch `m9-payments-and-cancellations`. [Milestone loop](./README.md#the-loop-every-milestone-follows)

## Objective

Guests can pay online through a hosted checkout or choose pay at the hotel. An online booking holds its inventory for about 15 minutes in `AWAITING_PAYMENT` and becomes `CONFIRMED` **only** when a verified payment success result arrives. Guests request cancellations until 24 hours before the branch's check-in time on the arrival date; a Manager of the branch or an Admin approves or rejects; approved paid bookings are refunded through the gateway's refund API and become `CANCELLED` when the gateway confirms. **No payment, WhatsApp, or email provider is chosen in this milestone** (ADR 030): everything is built and proven against fake adapters behind ports, and the real adapters are plugged in at launch (M15-T4). Guests can also verify by email when WhatsApp is not ready (ADR 031).

## Read first

- ADRs [030](../../adr/030-provider-neutral-integrations.md), [031](../../adr/031-email-verification-fallback.md), [025](../../adr/025-paymob-online-payment.md) (flow and rules; its Paymob wording is superseded by 030), [024](../../adr/024-immediate-confirmation.md), [016](../../adr/016-inventory-and-concurrency.md), [019](../../adr/019-guest-reservation-access.md); [architecture/provider-adapters.md](../../architecture/provider-adapters.md)
- [domain/reservation-lifecycle.md](../../domain/reservation-lifecycle.md) (payment and cancellation-request sections; PY and CX rules)
- [database/data-model.md](../../database/data-model.md) (`Payment`, `PaymentEvent`, `CancellationRequest`)
- [database/integrity-and-concurrency.md](../../database/integrity-and-concurrency.md) (C-12…C-14)
- [api/api-contracts.md](../../api/api-contracts.md) (P7 online path, P8, G2, G4, S9, S17–S19, S44, S45)
- [security/threat-model.md](../../security/threat-model.md) (payments, guest change abuse)
- Guest changes: [domain/reservation-lifecycle.md](../../domain/reservation-lifecycle.md#guest-changes-q-83q-85) (GC-1…6), FR-GCHG, API G5, G6, S56–S58, C-16, C-17; the M8-T9 change engine (spec 0005, Decision 14)
- No provider documentation is needed in this milestone. The spec records the minimum a payment provider must offer (hosted checkout, a verifiable server to server result, a refund API) and the behaviors the contract suite checks, drawn from how common gateways work.

## Blocking questions (must be answered before starting)

- Q-54 (decided): the online gateway charges **USD**.
- Q-92 (decided 2026-11-22): **no keys, accounts, or provider choice are needed**; this milestone does not wait for them. Q-55 is replaced.
- Q-93 (decided 2026-11-22): email verification fallback; confirm the per email cap default (2 upcoming bookings) in the M9-T12 plan.
- Q-62 ★, Q-63, Q-65 ★, Q-66 ★: recommendations accepted unless answered.

## Skills for this milestone

| Step | Skill | Notes |
| --- | --- | --- |
| Spec | `/architect` (`FEATURE`) | `PaymentGateway` port and contract suite, callback processing, hold expiry, refund state machine, verification channels |
| Build | `/develop` (logic track) | Fake adapters and contract suites first; no real provider adapter |
| Tests | `/test` | Callback forgery, duplicates, late success, refund failure, adapter contract suites |
| Failures | `/debug` | |
| Proof | `/check verify` | Full run on the fake gateway and its simulated checkout: pay, fail, abandon, late success, refund; email verification end to end |
| Review | `/check review` | Focus: callback verification contract, amount and currency checks, idempotency, no card data, secrets, email code abuse limits |
| After merge | `/sync` | Record payment conventions in `AGENTS.md` |

## In scope

Provider neutral ports with fake adapters and contract suites (payment, WhatsApp, email), online payment path, holds and expiry, callback endpoint, reconciliation job, late-success handling, cancellation requests, staff decision API, refunds and retry, paid staff cancellation, messages for each outcome. Added 2026-11-17: guest booking changes through the M8 change engine, applied at once for pay-at-hotel bookings (M9-T10) and as change requests for paid bookings whose total changes (M9-T11). Added 2026-11-22: email verification as a fallback channel (M9-T12).

## Out of scope (binding)

- Screens (M10, M11). Partial refunds (Q-66). A second online payment for a guest change (Q-85). Payment links for staff bookings (Q-37: staff bookings are pay at hotel). Embedding a card form or a provider iframe on Rivana pages. Storing any card data. **Any real payment, WhatsApp, or email provider adapter, keys, or sandbox run (M15-T4).**

## Task breakdown

Planned, reviewed, and accepted one task at a time ([agent-workflow.md](../../engineering/agent-workflow.md)). Rows are confirmed at milestone open; the numbered **Tasks** below hold the detail.

| Task | Title | Risk | Depends on | Covers (criteria, tests) | Status |
| --- | --- | --- | --- | --- | --- |
| M9-T0 | Public surface for `src/application/auth`: one `index.ts` and D-8 extended to it (refactor, no behavior change; recommended in the M8-T0b review package, owner decision 2026-11-14) | Medium | M8 | Existing tests unchanged and green; D-8 test extended | Accepted (2026-11-22) |
| M9-T0b | Adapter foundations (ADR 030) | Medium | T0 | AC 9, 10 | Accepted (2026-11-23) |
| M9-T1 | Migration `payments_and_cancellations` (enum rename, branch switch, `Payment`, `PaymentEvent`, `CancellationRequest`, outbox `HELD`) | Critical | T0 | AC 1, 6, 14, 15; drift check | Accepted (2026-11-23) |
| M9-T2 | Domain: payment transitions, `HoldPolicy`, `CancellationDeadline`, `PaymentMethodAvailability`, PY, CX, GC, Q-96 rules | Critical | T0 | AC 4, 6, 14, 15; T-PAY-1…4, T-CXL-1…3 | Accepted (2026-11-23) |
| M9-T3 | `PaymentGateway` port, registry, fake gateway, simulated checkout page, payment contract suite | Critical | T0b | AC 9, 10; T-ADP | Accepted (2026-11-23) |
| M9-T4 | Online booking path: `AWAITING_PAYMENT`, hold, held messages, checkout creation and failure, replay, in transaction expiry, P6 `paymentMethods`, A3 switch | Critical | T1, T2, T3 | AC 1, 4, 14; T-PAY-5 | Accepted (2026-11-24) |
| M9-T5 | Payment callback P8, idempotency, late success, mid milestone security review | Critical | T4 | AC 1, 2, 3, 5; C-12, C-13 | Not started |
| M9-T6 | Hold expiry and reconciliation jobs | Critical | T5 | AC 4, 5, 10; C-14 | Not started |
| M9-T7 | Guest cancellation requests (G2, G4), staff alert, Q-96 closing | Critical | T1, T2 | AC 6, 15, 16; T-CXL-4…5 | Not started |
| M9-T8 | Decisions and refunds (S9 paid, S17…S19, S44, S45) | Critical | T5, T7 | AC 7, 8, 10; T-PAY-8…10, T-CXL-6…8 | Not started |
| M9-T9 | Merged into T4…T11 (each task sends its own messages) | — | — | — | Merged (D-C) |
| M9-T10 | Guest changes, pay at hotel (G5, G6) | Critical | T2, M8-T9b, M8-T11 | AC 11; T-GCHG-1…8, C-16 | Not started |
| M9-T11 | Change requests for paid bookings (S56…S58), migration `change_requests` | Critical | T10, T8 | AC 12, 15, 16; T-GCHG-9…12, C-17 | Not started |
| M9-T12 | Email verification fallback, migration `verification_channels` | Critical | T0b, M8-T5, M8-T7b, M8-T11 | AC 13; T-VCH-1…8 | Not started |

AC 10 (the full run on the fake gateway) is recorded at milestone close. The real provider sandbox run belongs to M15-T4.

## Tasks

### 0. Prerequisite task (M9-T0): public surface for `auth`

Owner decision 2026-11-14, from the M8-T0b review package. Same shape as [M8-T0b](./m8-reservations.md#0b-follow-up-task-m8-t0b-public-surfaces-for-the-cms-modules): a refactor with **no behavior, schema, API, or contract change**. Done first so the M9 use cases (which all authorize) import `auth` through its index from the start.

1. **Objective.** `src/application/auth/index.ts` exports exactly the symbols used outside the module (`authorize`, `authorizeBranch`, the auth ports and types, `return-path`, `sign-in`), and every outside import (about 97 at M8-T0b, more after M8) goes through it.
2. **Scope in.** The index; rewriting importers (import lines only); adding `auth` to the application-only D-8 list in `tests/unit/architecture/module-boundaries.test.ts` and `eslint.config.mjs`; the D-8 row in `docs/architecture/dependency-rules.md`. `src/domain/auth` is included only if the plan shows it is equally simple.
3. **Watch.** `return-path` may be used by client components: keep those imports type only, or confirm the exported helper is pure and pulls no server code (D-13). Check for runtime cycles, since almost every module imports `authorize`.
4. **Acceptance.** Same as M8-T0b: moves only (import-stripped comparison), gates with unchanged counts plus the new D-8 cases, mutation checks, `openapi.json` unchanged.
5. **Risk.** Medium.
6. **As built (accepted 2026-11-22; review: [2026-11-22-m9-t0.md](../../reviews/2026-11-22-m9-t0.md)).** `src/application/auth/index.ts` exports exactly the symbols used outside (`authorize`, `authorizeBranch`, `branchScope`, `inBranchScope`, `safeReturnPath`, `loginPathFor`, `SignIn`, the two sign in message constants, and the types `BranchScope`, `StaffPrincipal`, `StaffAccount`, `StaffDirectory`, `CredentialAuthenticator`, `LoginThrottleStore`, `ThrottleKeyDeriver`). 91 outside files and the 3 internal files changed in import lines only (import stripped comparison with `HEAD` identical for all 94). `auth` joined the application only D-8 lists in the architecture test and ESLint. The one allowance in `ports-layout.test.ts` for the `BranchScope` type now names the auth index, protected by a new leaf guard test (auth imports only its own files, `shared`, the domain, and zod). `src/domain/auth` is not covered here; it is added to M14-T11. No client component imports auth, so rule D-13 did not come into play.


### 1. Database (migration `payments_and_cancellations`, implemented M9-T1)

1. The migration renames `PaymentMethod.PAYMOB` to `ONLINE` in place and retains the existing hold expiry column and PostgreSQL hold check. `ReservationPaymentStatus` gains `FAILED`. `Branch.onlinePaymentEnabled` defaults to `false`. M9-T1 introduced the `ONLINE` request value. M9-T4 implemented checkout for eligible requests. The retired value returns `422 VALIDATION`.
2. `Payment` stores positive USD minor units and lifecycle records, including `EXPIRED`, checkout URL, refund attempt count and request time. PostgreSQL allows one `INITIATED` payment per reservation and enforces uniqueness for assigned provider transaction IDs.
3. `PaymentEvent` stores a unique provider event ID, kind, outcome, processing result, receipt time, and optional amount and currency. An event for an unknown payment can have a null payment ID. The table has no provider payload column.
4. `CancellationRequest` stores guest and staff requests, decisions and closure reasons. PostgreSQL allows one `OPEN` request per reservation and accepts a closure reason only with `CLOSED`.
5. `NotificationOutbox` gains `HELD`. The dispatcher claims `PENDING` rows only. M9-T4 writes held confirmations at booking creation. Release on verified payment is planned for M9-T5. [Storage model](../../database/data-model.md#operations-tables-partly-implemented) · [Task log](../reports/m9-payments-and-cancellations.md#task-log)

### 2. Domain

1. State machine additions: `AWAITING_PAYMENT → CONFIRMED` (verified success), `AWAITING_PAYMENT → PAYMENT_FAILED` (failure or expiry), `CONFIRMED → CANCELLED` via an approved request or a staff cancellation (refund first when paid).
2. `CancellationDeadline.for(branch, checkIn)`: the instant 24 hours before `checkIn` at the branch's `checkInTime` in the branch time zone (CX-1); a reservation without a branch check-in time cannot be requested online.
3. Payment and refund rules PY-1…8, CX-1…7.

### 3. Application and infrastructure

1. **Gateway port (M9-T3, implemented).** `PaymentGateway` defines `createCheckout`, `verifyCallback`, `getTransaction`, and `refund`. A normalized refund result carries the original request's `refundAttemptKey` so a late result can be matched to its own attempt. [Spec 0006](../../specs/0006-m9-payments-and-cancellations.md#decision-1-ports-adapters-and-readiness-m9-t0b-t3-adr-030)
2. **Fake gateway and checkout (M9-T3, implemented).** The composition registry selects the server-only fake in development and test and reports its readiness. The simulator posts signed callbacks over HTTP and both simulator routes return `404` in production. M9-T5 adds the reservation webhook. The real adapter in M15-T4 must pass the same contract suite. [Provider guide](../../architecture/provider-adapters.md) · [Task log](../reports/m9-payments-and-cancellations.md#task-log)
3. **Online booking (M9-T4, implemented).** P7 commits a 15 minute hold, an initiated payment and held confirmations, then opens hosted checkout. A definite refusal releases inventory and coupon use. An ambiguous outcome preserves the hold for retry with the same payment ID. Both return `503 PAYMENT_UNAVAILABLE`. P6 lists eligible methods and A3 exposes the Admin branch switch. [Spec 0006](../../specs/0006-m9-payments-and-cancellations.md#decision-4-online-booking-path-and-held-messages-m9-t4) · [Task log](../reports/m9-payments-and-cancellations.md#task-log)
4. `ProcessPaymentCallback` (via `webhookRoute`): adapter verifies the callback → record `PaymentEvent` once → lock reservation → check amount and currency equal the payment → success: `CONFIRMED`, payment `SUCCEEDED`, outbox confirmation messages; failure: `PAYMENT_FAILED`, release; late success after expiry: re-lock listings, re-check availability, confirm or refund automatically and alert staff (Q-63). Always respond `200` to a verified event once recorded, so the gateway stops retrying; respond `401` to an unverified one.
5. **Expiry during booking (M9-T4, implemented).** Website, staff, and external booking creation expires overdue holds for the affected listings before counting inventory. The scheduled `ExpirePaymentHolds` job (`npm run reservations -- expire-holds`, every minute) is planned for M9-T6.
6. `ReconcilePayments` job (every 5 minutes): for `INITIATED` payments past expiry with no event, query `getTransaction` and process the result.
7. `RequestCancellation` (guest, manage token or guest session; before the deadline; `CONFIRMED` only; one open request).
8. `DecideCancellationRequest` (`cancellations:decide`, branch-scoped): reject with reason (booking stays `CONFIRMED`); approve unpaid → `CANCELLED`, release; approve paid → refund through the gateway port → on success `CANCELLED` and release, on pending wait for the refund callback, on failure `REFUND_FAILED` with retry (`RetryRefund`).
9. Staff cancellation of a paid booking: Manager and Admin only (Q-62), same refund path.
10. Messages (email and WhatsApp transactional templates): payment failed or expired (no "confirmed" wording), cancellation request received, approved (with refund status), rejected (with reason), refund completed, automatic refund after a late success; booking changed (old and new details and totals), change request received, approved, rejected (with reason).
11. **Guest changes, pay at hotel (M9-T10, Q-83, Q-84).** `PreviewGuestChange` (no write) and `ApplyGuestChange` call the M8 `ModifyReservation` engine through a guest entry point: the reservation comes from the manage token or the guest session (same phone), never from the body; GC-1 forbidden keys (`422`); GC-2 refusals as `403 CHANGE_NOT_ALLOWED` with a reason (deadline on current and new arrival, open request, blocked phone, status); `If-Match` and `expectedTotal`; PR-11 pricing (added services at current offering, coupon kept per Q-76); change history (actor `GUEST`), audit, outbox (`RESERVATION_MODIFIED` to the guest; staff alert), hotel-system flag. Confirm in the plan whether an email change also notifies the old address (threat model). Limits per client and per reservation.
12. **Change requests, paid bookings (M9-T11, Q-85).** When the reservation is `ONLINE` and paid, `ApplyGuestChange` applies a same-total change at once; otherwise it stores an `OPEN` `ChangeRequest` (requested change, previewed total; no inventory held; one open request of either kind per reservation, checked under the reservation row lock) and returns `202`. `DecideChangeRequest` (`cancellations:decide`, branch scoped): reject with reason; approve re-runs the engine under the locks and applies the change (change history links the request) or leaves the request `OPEN` with the conflict recorded. The difference is settled at the desk (Q-66); no refund or second payment.
13. **Adapter foundations (M9-T0b, ADR 030, implemented).** The reservation outbox selects email delivery through `EMAIL_PROVIDER`. The `fake` adapter records messages in memory and `smtp` uses the existing message renderer and transport settings. Environment validation refuses `fake` in production for all three kinds. Shared WhatsApp and email contract suites pass against both fakes and both existing live adapters with stubbed responses. The readiness reader reports `unconfigured`, `fake`, or `real` per kind. [Provider guide](../../architecture/provider-adapters.md) · [Task log](../reports/m9-payments-and-cancellations.md#task-log)
14. **Email verification fallback (M9-T12, ADR 031).** P9 takes `channel` (`WHATSAPP` default, `EMAIL`) and, for email, `email`; the code is sent by the email adapter and bound to verification id, phone, email, purpose, and channel; P10 is unchanged; P7 requires `guest.email` to equal the verified email for an email token and stores `phoneVerified = false`; per phone coupon limits are skipped and never revealed for an unverified phone; per email rolling limits, the per client limits, and the per email cap of upcoming bookings; blocked phones refused and open email verifications invalidated by a block; a guest session from the email channel lists reservations by email only; the readiness gate becomes "WhatsApp ready or email ready" (`BRANCH_NOT_BOOKABLE` reason, branch switch refusal text, `EMAIL_NOT_CONFIGURED` `503`). The M8 WhatsApp behavior is unchanged.

### 4. API

P7 online path (`paymentMethod: "ONLINE"`; `201 { reference, status: "AWAITING_PAYMENT", checkoutUrl, holdExpiresAt, manageUrl }`), P8 callback (`POST /api/v1/payments/callback`), P9 `channel` and `email` (M9-T12), G2 and G4 cancellation requests, S9 paid path, S17 list requests, S18 approve, S19 reject, S44 payments of a reservation, S45 retry refund. Added 2026-11-17: G5 change preview, G6 apply change (both via manage token and guest session), S56 list change requests, S57 approve, S58 reject.

## Database impact

Additive migrations: `payments_and_cancellations` (with the enum value rename), `change_requests` (M9-T11), and `verification_channels` (M9-T12).

## API impact

As listed; the callback endpoint is documented in OpenAPI as a webhook.

## Acceptance criteria

1. An online booking is `AWAITING_PAYMENT` with a checkout URL; no confirmation message is dispatchable until a verified success is processed (on the fake gateway); then it is `CONFIRMED` and its confirmation messages are released in that transaction.
2. A callback the adapter rejects, a different amount or currency, or an unknown payment changes no reservation or payment state, is recorded as ignored (when it passed the signature check), and is logged without payload data; a genuine retry of the same event is still applied.
3. A duplicate verified callback changes nothing (idempotent) (C-13).
4. A declined attempt keeps the hold and the booking stays `AWAITING_PAYMENT`. An expired hold (or a gateway report that the session closed unpaid) makes the reservation `PAYMENT_FAILED`, releases its inventory and coupon redemption, and sends "payment not completed", never a confirmation.
5. A booking racing an expiring hold for the last unit never oversells (C-14); a late success after the unit was resold triggers an automatic refund and staff alert (C-12).
6. A cancellation request before the deadline is created; after the deadline it returns `409 CANCELLATION_WINDOW_CLOSED` with the branch contact details; a second open request returns `409 CANCELLATION_REQUEST_EXISTS`.
7. Only a Manager of the branch or an Admin can decide a request; rejection keeps the booking `CONFIRMED` and messages the reason; approval of a paid booking calls the gateway's refund with the captured amount and sets `CANCELLED` only after the gateway confirms; a refund failure is visible and retryable.
8. Receptionists cannot cancel a paid booking.
9. No card number, CVV, or full provider payload is stored or logged; secrets are server-only (bundle check); `fake` is refused in production for payment, WhatsApp, and email.
10. A full run on the fake gateway and its simulated checkout page covers success, a declined attempt then success, abandonment, late success, a lost callback, and refund (pending, succeeded, failed then retried). The payment, WhatsApp, and email contract suites pass for every adapter in the repository. No real provider sandbox run is part of M9.
11. A guest change to a pay-at-hotel booking before the deadline applies at once with the previewed total, writes one change-history row, one audit event, and the guest and staff messages, and flags a booking already entered in the hotel system; after the deadline, with an open request, for a blocked phone, with a stale version, or with a forbidden key nothing changes; a change racing a booking for the last unit never oversells (C-16).
12. A change to a paid booking that alters the total creates one `OPEN` change request and holds nothing; only a Manager of the branch or an Admin decides it; approval re-checks inventory and prices and applies the change or records the conflict (C-17); no gateway call is made.
13. A guest can verify by email: the code arrives by the fake email adapter, expires in 10 minutes, allows 5 attempts, and is single use; a booking with an email token needs the same email and is stored with `phoneVerified = false`; a per phone coupon limit is neither applied nor revealed for it; a blocked phone gets no code and no booking; per email and per client limits return `429`; responses are identical whether or not the email has history; with WhatsApp not ready and email ready, a branch can be switched to online booking and a booking succeeds; with neither ready it cannot (ADR 031).
14. Online payment is offered for a branch only when a gateway is ready, the branch's `onlinePaymentEnabled` switch is on, and the total is above zero. P6 returns the allowed `paymentMethods`; P7 refuses any other method with `409 PAYMENT_METHOD_UNAVAILABLE`. Only an Admin can turn the switch on, and it is refused while no gateway is ready.
15. Staff cancellation, no-show, or check-in of a reservation with an open cancellation or change request closes that request in the same transaction (`CLOSED`, with the reason and the staff user), audited; the request can no longer be decided.
16. A new cancellation or change request queues one staff alert email to the branch contact address in the same transaction as the request.

## Tests

- Unit: T-PAY-1…4 (state transitions, amount checks, deadline computation across time zones and DST), T-CXL-1…3.
- Integration: T-PAY-5…10 (fake gateway: checkout creation failure, callback verify, duplicate, late success, reconciliation, refund pending, failed, retry), T-CXL-4…8 (request rules, decisions, authorization, audit), webhook Route Handler tests (raw body, `401`, `200`).
- Integration (added 2026-11-17): T-GCHG-1…12 (preview, apply, every refusal, PR-11 money, history, audit, outbox, flag, authorization through both guest credentials, change requests and decisions).
- Contract suites: payment gateway, WhatsApp transport, email sender (each adapter in the repository passes its suite). Integration (added 2026-11-22): T-VCH-1…8 (email code request and confirm, limits, token and email match, `phoneVerified`, coupon limit skipped and not revealed, block invalidation, session by email, readiness gate).
- Concurrency: C-12, C-13, C-14, C-16, C-17.

## Evidence for the report

Fake gateway run transcript (no personal data); state diagrams as exercised; contract suite results; callback verification tests; refund flow walk-through; the email verification walk-through.

## Risks

- A real provider behaves differently from the fake (ADR 030 risks). Mitigation: the contract suite and the M15-T4 sandbox run; do not add provider specific behavior to use cases.
- Email verification is weaker against abuse than phone verification (ADR 031). Mitigation: per email limits and cap.
- Lost callbacks: the reconciliation job.
- Refund API latency or failure: explicit states and retry.

## Handoff

Close the milestone ([README steps 8–15](./README.md#the-loop-every-milestone-follows)), report, then stop. M10 has not started.
