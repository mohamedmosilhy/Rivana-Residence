# 0006. M9 online payments, cancellation and change requests, and email verification

**Date**: 2026-11-22
**Status**: In Progress (the owner approved the content, the cross check fixes, and the task breakdown on 2026-11-22; the status moves with the milestone)

## Summary

This is the build spec for milestone M9. Guests can pay online through a hosted checkout or pay at the hotel. An online booking holds its rooms for 15 minutes and becomes confirmed only when a verified payment result arrives. Guests can ask to cancel or change a booking, and a Manager or Admin decides. Paid bookings are refunded through the gateway. Guests can also verify by email when WhatsApp is not ready.

No payment, WhatsApp, or email provider is chosen in M9. Every rule lives in Rivana behind small ports (interfaces), proven against fake adapters, so the real providers are plugged in at launch (ADR 030).

## Context

Brief: [m9-payments-and-cancellations.md](../delivery/milestones/m9-payments-and-cancellations.md). Binding decisions: ADR [024](../adr/024-immediate-confirmation.md) (immediate confirmation, cancellation requests), [025](../adr/025-paymob-online-payment.md) (reserve, then hosted checkout, holds, refunds; its provider wording is superseded by 030), [016](../adr/016-inventory-and-concurrency.md) (locks and counts), [019](../adr/019-guest-reservation-access.md) (manage link and guest session), [027](../adr/027-booking-price-composition.md) (price order), [028](../adr/028-whatsapp-guest-messaging.md) (messages), [030](../adr/030-provider-neutral-integrations.md) (provider neutral ports), [031](../adr/031-email-verification-fallback.md) (email verification). Domain rules: [reservation-lifecycle.md](../domain/reservation-lifecycle.md) (PY-1…8, CX-1…7, GC-1…6). Data: [data-model.md](../database/data-model.md). Concurrency: [integrity-and-concurrency.md](../database/integrity-and-concurrency.md) (C-12…C-17). API: [api-contracts.md](../api/api-contracts.md) (P7 online, P8, G2, G4, G5, G6, S9, S17…S19, S44, S45, S56…S58). Builds on spec [0005](./0005-m8-reservations.md) (M8: lock order, outbox, change engine, guest access).

Money is involved, so the forces are strict. A booking must never be confirmed without a verified success. A guest must never be charged for a room Rivana cannot give. No card data may reach Rivana, and every money state must stay true when callbacks arrive late, twice, or not at all. Requests and refunds are audited actions by named staff.

M8 already left room for this: the `AWAITING_PAYMENT` and `PAYMENT_FAILED` statuses, `holdExpiresAt`, and `paymentStatus` exist in the schema. Inventory consumption follows `ReservationRoom.consumesInventory`. `InventoryGuard` has a `prepare` hook and a "expire overdue holds" step that does nothing yet. `webhookRoute` exists in `src/app/api/v1/_http/routes.ts`. The change engine `ModifyReservation` has a staff entry point. `CreateWebsiteReservation` refuses the online method today.

The project is one Next.js application on PostgreSQL (`AGENTS.md`). The build approach is task by task, backend before screens; there is no screen in M9. Compliance: PCI scope stays at the hosted checkout level (no card data); guest data rules of the threat model apply.

### Decision provenance

Owner answers given while drafting this spec (2026-11-22), recorded as Q-94…Q-97 when the spec is approved:

- **Q-94 (online payment per branch)**: one gateway account for all branches, plus an Admin switch per branch, off by default.
- **Q-95 (failed attempt)**: a declined attempt keeps the hold; the guest may retry on the checkout page until the hold expires. Amends ADR 025 step 3.
- **Q-96 (open request when the booking leaves `CONFIRMED` another way)**: staff cancellation, no-show, or check-in closes the open cancellation or change request automatically, in the same transaction, audited.
- **Q-97 (staff alert)**: a new cancellation or change request emails the branch contact address, like the M8 booking alert.

Decisions already made and only cited here: Q-37, Q-38, Q-54, Q-57, Q-60, Q-62…Q-66, Q-75, Q-76, Q-83…Q-85, Q-92, Q-93.

## Requirements

**User stories**:

- As a guest, I want to pay online and see "Confirmed" only when my payment really succeeded, so I am never misled or charged for nothing.
- As a guest, I want to ask to cancel or change my booking online before the deadline, so I don't have to call.
- As a Manager or Admin, I want to decide requests and see refunds through to the end, so guests are treated fairly and the money is right.
- As a guest without WhatsApp, I want to verify by email, so I can still book.
- As the owner, I want every provider to plug in at launch without rewriting rules.

**Acceptance criteria** (AC-1…AC-13 keep the brief's numbers and meaning; changed wording is marked; AC-14…AC-16 are new):

- **AC-1**: An online booking is `AWAITING_PAYMENT` with a checkout URL; no confirmation message is dispatchable until a verified success is processed (on the fake gateway); then it is `CONFIRMED` and its confirmation messages are released in that transaction.
- **AC-2** *(wording refined by the cross check)*: A callback the adapter rejects, a different amount or currency, or an unknown payment changes no reservation or payment state, is recorded as ignored (when it passed the signature check), and is logged without payload data; a genuine retry of the same event is still applied.
- **AC-3**: A duplicate verified callback changes nothing (idempotent) (C-13).
- **AC-4** *(changed, Q-95)*: A declined attempt keeps the hold and the booking stays `AWAITING_PAYMENT`. An expired hold (or a gateway report that the session closed unpaid) makes the reservation `PAYMENT_FAILED`, releases its inventory and coupon redemption, and sends "payment not completed", never a confirmation.
- **AC-5**: A booking racing an expiring hold for the last unit never oversells (C-14); a late success after the unit was resold triggers an automatic refund and a staff alert (C-12).
- **AC-6**: A cancellation request before the deadline is created; after the deadline it returns `409 CANCELLATION_WINDOW_CLOSED` with the branch contact details; a second open request returns `409 CANCELLATION_REQUEST_EXISTS`.
- **AC-7**: Only a Manager of the branch or an Admin can decide a request; rejection keeps the booking `CONFIRMED` and messages the reason; approval of a paid booking calls the gateway's refund with the captured amount and sets `CANCELLED` only after the gateway confirms; a refund failure is visible and retryable.
- **AC-8**: Receptionists cannot cancel a paid booking.
- **AC-9**: No card number, CVV, or full provider payload is stored or logged; secrets are server only (bundle check); `fake` is refused in production for payment, WhatsApp, and email.
- **AC-10**: A full run on the fake gateway and its simulated checkout page covers success, a declined attempt then success, abandonment, late success, a lost callback, and refund (pending, succeeded, failed then retried). The payment, WhatsApp, and email contract suites pass for every adapter in the repository. No real provider sandbox run is part of M9.
- **AC-11**: A guest change to a pay at hotel booking before the deadline applies at once with the previewed total, writes one change history row, one audit event, and the guest and staff messages, and flags a booking already entered in the hotel system; after the deadline, with an open request, for a blocked phone, with a stale version, or with a forbidden key nothing changes; a change racing a booking for the last unit never oversells (C-16).
- **AC-12**: A change to a paid booking that alters the total creates one `OPEN` change request and holds nothing; only a Manager of the branch or an Admin decides it; approval re-checks inventory and prices and applies the change or records the conflict (C-17); no gateway call is made.
- **AC-13**: A guest can verify by email per ADR 031: the code arrives by the fake email adapter, expires in 10 minutes, allows 5 attempts, and is single use; a booking with an email token needs the same email and is stored with `phoneVerified = false`; a per phone coupon limit is neither applied nor revealed for it; a blocked phone gets no code and no booking; per email and per client limits return `429`; responses are identical whether or not the email has history; with WhatsApp not ready and email ready a branch can take online bookings; with neither it cannot.
- **AC-14** *(new, Q-94)*: Online payment is offered for a branch only when a gateway is ready, the branch's `onlinePaymentEnabled` switch is on, and the total is above zero. P6 returns the allowed `paymentMethods`; P7 refuses any other method with `409 PAYMENT_METHOD_UNAVAILABLE`. Only an Admin can turn the switch on, and it is refused while no gateway is ready.
- **AC-15** *(new, Q-96)*: Staff cancellation, no-show, or check-in of a reservation with an open cancellation or change request closes that request in the same transaction (`CLOSED`, with the reason and the staff user), audited; the request can no longer be decided.
- **AC-16** *(new, Q-97)*: A new cancellation or change request queues one staff alert email to the branch contact address in the same transaction as the request.

## Options considered

### Option 1: Build the provider in (Paymob first), as the brief first said

Write the Paymob adapter and run against its sandbox.

**Pros**: real behavior from day one; fewer fake components.

**Cons**: M9 waits for keys and an account; provider names leak into routes, enums, and tests; the client's later choice becomes a rewrite. Rejected by ADR 030.

### Option 2: Provider neutral ports, fake adapters as reference, contract suites (chosen)

Own every rule in Rivana; providers are thin adapters written at launch.

**Pros**: no dependency on accounts or approvals; one place for money rules; launch work is an adapter plus its contract suite.

**Cons**: a faithful fake must be built and maintained; a provider quirk can still surface at launch (mitigated by the M15 sandbox run).

### Option 3: Pay first, then reserve

Take the payment, then create the reservation.

**Pros**: no holds, no expiry job.

**Cons**: a guest can be charged for a room that sold meanwhile; refunds become routine. Rejected by ADR 025.

## Decision

**Chosen option**: Option 2: provider neutral ports with fake reference adapters, the ADR 025 flow, and the owner answers Q-94…Q-97.

### Decision 1. Ports, adapters, and readiness (M9-T0b, T3; ADR 030)

- **`PaymentGateway`** (`src/application/payments/ports.ts`):
  - `createCheckout({ paymentId, amountMinor, currency, reference, customer: { name, email }, expiresAt, returnUrl })` → `{ checkoutUrl, providerOrderId? }` or a failure code.
  - `verifyCallback({ rawBody, headers, url })` → a normalized event `{ providerEventId, kind: "TRANSACTION" | "REFUND", outcome: "SUCCEEDED" | "DECLINED" | "SESSION_CLOSED" | "REFUND_SUCCEEDED" | "REFUND_FAILED", paymentId, providerTransactionId?, amountMinor, currency }`, or `{ rejected: true }`.
  - `getTransaction({ paymentId, providerOrderId?, providerTransactionId? })` → the same normalized event or `NOT_FOUND`.
  - `refund({ paymentId, providerTransactionId, amountMinor, currency, idempotencyKey })` → `PENDING | SUCCEEDED | FAILED` with an optional refund id.
- **Refund attempt identity (owner decision, 2026-11-23).** Every normalized `REFUND` event carries a required `refundAttemptKey` equal to the original `refund` call's `idempotencyKey` (`Payment.id` plus `Payment.refundAttempt`). This applies to verified callbacks and lookup results. The adapter recovers the key from trusted provider data for that attempt. The fake stores it on the attempt and signs it in the callback. An earlier attempt can report a failure after a retry has started, so the payment and charge IDs alone cannot identify the attempt.
- **Registry** in `src/composition` chooses the adapter from `PAYMENT_PROVIDER` (`fake` only in M9). Unset in production means online payment is off.
- **Readiness reader** reports, per kind (payment, WhatsApp, email), whether a usable adapter is configured. The branch switch, P6, P7, and P9 use it.
- **`EMAIL_PROVIDER`** (`smtp`, `fake`) replaces the "SMTP configured or not" check; the fake email adapter records deliveries in memory like the fake WhatsApp transport.
- **Environment validation** refuses `fake` in production for all three kinds.
- **Fake gateway** (`src/infrastructure/payments/fake/`): signs its callbacks with HMAC SHA 256 under `PAYMENT_FAKE_SECRET` (a fixed development default when unset; refused in production with the rest of `fake`). It keeps per payment scenarios in memory for tests (decline, close, drop the callback, refund pending, refund failed).
- **Simulated checkout page** `/dev/fake-checkout/[paymentId]` (a page plus a Route Handler that posts the signed event to P8 over HTTP, so the real webhook path runs). It returns `404` unless `PAYMENT_PROVIDER=fake` and the environment is not production. It is the M10 browser stand in for a hosted checkout.
- **Contract suites** (`tests/contract/`): one per port, run against every adapter in the repository (fake gateway; fake and Meta WhatsApp transports; fake and SMTP email senders), with the cases listed in [provider-adapters.md](../architecture/provider-adapters.md).

### Decision 2. Migration `payments_and_cancellations` (M9-T1)

- `PaymentMethod` value `PAYMOB` renamed `ONLINE` (`ALTER TYPE … RENAME VALUE`; no row holds it). The P7 contract and OpenAPI change in the same commit.
- `Branch.onlinePaymentEnabled boolean NOT NULL DEFAULT false` (Q-94).
- `Payment` as in the data model, plus `checkoutUrl varchar(2048) NULL` (needed for an idempotent P7 replay) and status values `INITIATED | SUCCEEDED | EXPIRED | FAILED | REFUND_PENDING | REFUNDED | REFUND_FAILED` (`EXPIRED` added for the Q-95 hold end; `FAILED` covers a checkout that could not be created). At most one non terminal (`INITIATED`) payment per reservation (partial unique index). `refundAttempt int NOT NULL DEFAULT 0` (the refund idempotency key is `Payment.id` plus this number) and `refundRequestedAt timestamptz NULL` (set when the refund call is actually sent; null on a `REFUND_PENDING` payment means the call never went out).
- `PaymentEvent` as in the data model (`providerEventId` unique; no full payload), plus `outcome` and `result` (`APPLIED | IGNORED_MISMATCH | IGNORED_UNKNOWN | IGNORED_STATE`). Events for an unknown payment are stored with `paymentId` null.
- `ReservationPaymentStatus` gains `FAILED`. Mapping for `ONLINE`: `AWAITING` at creation, `PAID` on success, `FAILED` when the reservation becomes `PAYMENT_FAILED`, `REFUND_PENDING` while a refund runs, `REFUNDED` when it completes; a failed refund returns it to `PAID`. `PAY_AT_HOTEL` stays `NOT_REQUIRED`.
- `CancellationRequest` as in the data model, plus `requestedBy` (`GUEST | STAFF`), `closedReason` (`STAFF_CANCELLED | NO_SHOW | CHECKED_IN`, null unless `CLOSED`), and status values `OPEN | APPROVED | REJECTED | REFUND_PENDING | REFUND_FAILED | COMPLETED | CLOSED`. Partial unique index: one `OPEN` request per reservation.
- `NotificationOutbox.status` gains `HELD` (Decision 4; owner decision D-A). The dispatcher's claim query already selects only `PENDING` (`outbox.ts`), so held rows are never claimed; every other place that switches on the outbox status (types, mappers, tests) is updated in the same task.
- Checks: DB-16 (`AWAITING_PAYMENT` needs `ONLINE` and `holdExpiresAt`); amounts positive and currency `USD` on `Payment`; `closedReason` only with `CLOSED`.
- M9-T11 added `ChangeRequest` and linked it to reservation history in `change_requests`. The same migration added `cancelReason` and `notifyGuest` to `CancellationRequest`. The verification channel columns remain with M9-T12 (`verification_channels`).

### Decision 3. Domain rules (M9-T2)

- State machine additions: `AWAITING_PAYMENT → CONFIRMED` (verified success), `AWAITING_PAYMENT → PAYMENT_FAILED` (expiry or a session closed unpaid; **not** a declined attempt, Q-95), `PAYMENT_FAILED → CONFIRMED` only through PY-5 (late success with every unit free under lock), `CONFIRMED → CANCELLED` through an approved request or staff cancellation (refund first when paid).
- `HoldPolicy`: hold length 15 minutes from creation; the gateway session expires 2 minutes before the hold, so a payment in progress finishes before the units are released; at most one open hold per phone (Q-60).
- `CancellationDeadline.for(branch, checkIn)`: 24 hours before `checkInTime` on the arrival date in the branch time zone (CX-1); no check-in time means no online request. Bookings made inside the window never get one (Q-64). The deadline is computed when the guest makes the request, from the reservation's current check-in, so a booking confirmed late by PY-5 follows the same rule.
- `PaymentMethodAvailability`: `ONLINE` allowed when the gateway is ready, `branch.onlinePaymentEnabled`, and `total > 0` (CP-6); `PAY_AT_HOTEL` always.
- Request rules: CX-1…7, GC-1…6, and the Q-96 closing rule. **Active request (owner decision 2026-11-23, review of M9-T2):** a request blocks a new cancellation request or guest change while it is `OPEN`, `APPROVED`, `REFUND_PENDING`, or `REFUND_FAILED` (the booking is still `CONFIRMED` in all four), and also while the payment is `REFUND_PENDING`. Only `REJECTED`, `COMPLETED`, and `CLOSED` are finished. A blocked phone cannot start either (Q-75).
- **Absolute 24 hours (owner approved 2026-11-23):** the deadline is `check-in instant − 24 h` (an exact 24 hours), not the same wall clock time the day before; across a daylight saving change the local time of the deadline shifts by an hour. A request is allowed strictly before the deadline.
- **Money matches:** a verified event whose amount is not a positive whole number, or differs from the payment, or whose currency is not `USD`, is a mismatch (the callback still answers 200 and changes nothing). `CANCEL_APPROVED` needs `PAY_AT_HOTEL` with `NOT_REQUIRED`, or `ONLINE` with `REFUNDED` (the state after the refund). A paid online change applies at once only when the new total equals the paid total (GC-4).
- Pure, no I/O, tested with the unit suite (T-PAY-1…4, T-CXL-1…3).

### Decision 4. Online booking path and held messages (M9-T4)

- `CreateWebsiteReservation` with `paymentMethod: "ONLINE"`: the M8 transaction and lock order unchanged (guest row, listings by id, coupon row, reservation rows). It checks `PaymentMethodAvailability` and one open hold per phone, then inserts the reservation `AWAITING_PAYMENT` with `holdExpiresAt` and `paymentStatus AWAITING`, consumes inventory and the coupon redemption, inserts the `Payment` row (`INITIATED`, `expiresAt` = hold minus 2 minutes), audits, and writes the guest confirmation messages as **`HELD`** outbox rows (with the manage link, the only moment the raw manage token exists). The staff alert is held too.
- **Why held rows (owner decision D-A).** R-10 says confirmation messages are written only in the transaction that sets `CONFIRMED`, but the raw manage token exists only at creation (only its hash is stored). Held rows are never dispatched. The confirming transaction (including a late success, PY-5) flips them to `PENDING`. They are deleted once the payment is known to be unpaid for good: the reconciliation job finds no success, or 24 hours have passed since the hold ended. The guarantee R-10 protects (no message describes an uncommitted or untrue state) holds; R-10's wording is amended to "released only by the transaction that sets `CONFIRMED`".
- After commit, call `createCheckout`. Success stores `checkoutUrl` and returns `201 { reference, status: "AWAITING_PAYMENT", holdExpiresAt, checkoutUrl, manageUrl }`. A **definite refusal** is final for the payment ID, including concurrent calls and retries. It runs a second transaction that sets the reservation to `PAYMENT_FAILED`, the payment and `paymentStatus` to `FAILED`, releases inventory and coupon use, deletes held confirmations, and queues the “payment not completed” notice. The response is `503 PAYMENT_UNAVAILABLE`. An **ambiguous failure** (timeout, network error, `UNAVAILABLE`) leaves the hold and initiated payment in place and returns the same `503`. A retry can recover the checkout. Scheduled expiry and reconciliation are planned for M9-T6.
- A matching replay returns the current reservation status and `manageUrl: null`. It includes the stored `checkoutUrl` while the payment is `INITIATED` and the gateway session is live. If the URL is missing during that window, the replay calls `createCheckout` again for the same `Payment.id`. At the session deadline, two minutes before the hold ends, the replay omits the checkout URL. The shared adapter suite requires concurrent and repeated calls for one ID to reuse the checkout.
- Website, staff, and external booking creation expire overdue holds for the affected listings inside their `InventoryGuard` transaction. They do this under the listing locks before counting inventory (PY-6).
- P6 returns an empty `paymentMethods` array for an unbookable quote. A bookable quote includes `PAY_AT_HOTEL` and adds `ONLINE` when the gateway is ready, the branch switch is on, and the total is positive. A3 (`PATCH /api/v1/staff/branches/{id}`) accepts and returns `onlinePaymentEnabled` (Admin, `branches:manage`). It refuses enablement with a field error while no gateway is ready and audits changes. These P6 and P7 response details were approved in the M9-T4 task card.

### Decision 5. Payment callback (M9-T5)

- `POST /api/v1/payments/callback` through `webhookRoute` (64 KB cap, no session, no CSRF). The route passes the raw body, headers, and URL to `verifyCallback`; a rejection returns `401 WEBHOOK_SIGNATURE_INVALID` with no detail.
- **Lock rule for every M9 path (one rule):** never take a listing lock after a reservation lock. Paths that do not change inventory (success on `AWAITING_PAYMENT`, decline, refund completion, request creation and decisions on unpaid bookings, guest change requests) and releases (expiry, session closed, cancellation) lock only the reservation row, as in M8. Paths that may take inventory (late success, guest change apply, change request approval) first read the payment and reservation without locks, then lock the listings by id, then the reservation row, and re-check the state before writing.
- `ProcessPaymentCallback`, one transaction: look up the `PaymentEvent` by `providerEventId`. If it exists with `result APPLIED`, stop and return `200`. Otherwise insert it (or update the earlier ignored row), find the payment by the merchant reference, check amount and currency against the payment, apply the outcome under the lock rule, and store `result`: `APPLIED`, `IGNORED_MISMATCH` (amount or currency differs; logged without payload), `IGNORED_UNKNOWN` (no such payment), or `IGNORED_STATE` (the state no longer accepts it, for example a second success). Adapters return one stable event ID per transaction outcome or per refund attempt and outcome (contract suite case).
- A callback for an `INITIATED` payment whose `checkoutUrl` is not stored yet (the gateway answered faster than the create response) is processed normally.
  - `SUCCEEDED` on `AWAITING_PAYMENT`: lock the reservation; `CONFIRMED`, payment `SUCCEEDED`, `paymentStatus PAID`, held messages released, audit.
  - `DECLINED`: record only; the hold stays (Q-95).
  - `SESSION_CLOSED`: as expiry (Decision 6).
  - `SUCCEEDED` on `PAYMENT_FAILED`, whether the payment is `EXPIRED` or `FAILED` (late success, PY-5): under the lock rule (listings, then reservation); if every unit is free, confirm as above and release the held messages. If the held rows are already gone (deleted after 24 hours, or a definite refusal that turned out wrong), issue a new manage token (the old hash is replaced) and queue a fresh confirmation with the new link. If a unit is gone, mark the payment `REFUND_PENDING`, request a full refund after commit, alert staff, and message the guest (`payment.auto-refunded`, Q-63).
  - `REFUND_SUCCEEDED` / `REFUND_FAILED` (`kind REFUND`): match by `paymentId`, check the amount and currency, and pass the checked outcome and `refundAttemptKey` to `CompleteRefund` (Decision 7). Record a result for an older attempt as `IGNORED_STATE` and acknowledge the callback.
- Every verified event that was recorded returns `200`, so the gateway stops retrying.
- **Implementation notes (M9-T5, owner-approved plan 2026-11-24).**
  - `REFUND` events were recorded as `IGNORED_STATE` in T5. Since M9-T8 they go to `CompleteRefund` under the reservation lock; only a result for the current attempt is `APPLIED`.
  - The automatic refund request is sent by T5 after commit with the key `refundAttemptKey(paymentId, attempt)` (`<paymentId>:refund:<attempt>`). `refundRequestedAt` is stamped only after the call returns. A thrown call leaves it null for the T6 sweep. T8 reuses the same key function.
  - Held confirmations are released only when the stored recipients equal the reservation's current email and phone and the stored link's token still hashes to `manageTokenHash`. Otherwise the held rows are dropped, the token is rotated, and a fresh confirmation goes to the current contact (the M9-T4 handoff).
  - A late confirmation re-acquires the released coupon use with no limit check, after locking the coupon (listings, coupon, reservation).
  - New outbox kinds: `payment.auto-refunded` (guest, WhatsApp purpose `REFUND_COMPLETED`) and `payment.staff-alert` (branch email only). The `request.staff-alert` kind stays with M9-T7.
  - If a verified success reaches a reservation that is neither awaiting nor failed (for example cancelled), it takes the automatic refund path. The guest notice and staff alert are queued for `PAYMENT_FAILED` and `CANCELLED` reservations.
  - **Follow ups the owner approved with the T5 review (2026-11-24).** M9-T6 `reconcile-payments` looks up a missing provider transaction id with `getTransaction` before it sends an automatic refund, because T5 leaves such a refund `REFUND_PENDING` and unsent (the staff alert covers it until then). M9-T8 raises a staff alert when a second success arrives for a payment that already succeeded with a different transaction id (a possible double charge), instead of ignoring it silently.
- A mid milestone security review (callback verification, idempotency, amount checks, logs) runs with this task, as M8 did after T7b.

### Decision 6. Jobs (M9-T6)

- `npm run reservations -- expire-holds` (every minute): `AWAITING_PAYMENT` past `holdExpiresAt` becomes `PAYMENT_FAILED` under the reservation lock; payment `EXPIRED`; inventory and coupon released; held rows kept for a possible late success; "payment not completed" message (email and WhatsApp purpose `PAYMENT_NOT_COMPLETED`); audit.
- `npm run reservations -- reconcile-payments` (every 5 minutes):
  - `INITIATED` payments past `expiresAt` with no success: ask `getTransaction` and process the answer through the callback code.
  - `REFUND_PENDING` with `refundRequestedAt` null and older than 2 minutes (the server stopped between the decision commit and the refund call): send the refund now with the same idempotency key.
  - `REFUND_PENDING` with the call sent more than 10 minutes ago: ask the gateway for the refund result and pass its outcome and attempt key to `CompleteRefund`.
  - Held rows are deleted only when the reservation is `PAYMENT_FAILED`, its payment is `EXPIRED` or `FAILED`, and a `getTransaction` asked at least 30 minutes after the payment's `expiresAt` (the grace period, owner decision 2026-11-24, M9-T6 review) reports no success; or, as a fallback, 24 hours after the hold ended. Before the grace period ends a no success answer keeps the rows and the job asks again, because a payment can still be settling just after its session ends and a success found later is confirmed or refunded only while the held rows exist.
- **Implementation notes (M9-T6, owner-approved plan 2026-11-24, review fixes accepted 2026-11-24).**
  - Both jobs read their backlog in pages (100 holds, 50 items per reconcile step, at most 5 pages per run). Every item seen in a run is excluded from the next page, so an item that keeps failing cannot hold the head of the queue. Each item is isolated. The summaries carry counts only and the jobs log nothing.
  - `ProcessPaymentCallback.applyVerifiedEvent` is the one place an authenticated event is applied; P8 and reconciliation both call it. Only `TRANSACTION` answers for the payment that was asked about are applied; a `REFUND` answer or an answer for another payment id is left alone (refund answers belong to T8). The summary field `answered` counts answers processed through that code, whatever the callback decided.
  - A reported success on an `EXPIRED` payment is applied by the held row cleanup step (late success), so a callback lost before the expiry job ran is still recovered while the held rows exist. `NOT_FOUND` counts as no success for that cleanup only, and only after the grace period above.
  - Unsent refunds use `refundAttemptKey(paymentId, refundAttempt)` and stamp `refundRequestedAt` only after the call returns, and only for the attempt that was sent (`markRefundRequested` takes the expected attempt, also used by the T5 callback refund). A missing transaction id is looked up and stored first, and only a successful answer with the same payment, amount and currency is used. A definite `FAILED` refund result is still stamped as sent here; T8 owns refund results.
  - Every gateway call in reconciliation has a 15 second timeout (a timeout counts as a failure and is retried next run). Each job runs under a PostgreSQL advisory lock held by a guard transaction, so a slow run is never overlapped by the next cron start; a skipped run prints `{"skipped":"ALREADY_RUNNING"}`.
  - The held message cleanup starts from the few held outbox rows (read window of 500, oldest first) instead of scanning every expired payment.
  - Dispatch lives in `src/composition/payment-jobs.ts`, not `reservation-jobs.ts`, because the payment factories import `reservation-jobs.ts` (message writer) and a second import back would be a cycle. `scripts/reservations.mts` calls it directly.
  - `scripts/reservations.mts` drops one third party notice, Prisma's pg adapter (7.10 with pg 8.23) triggering pg's "client.query() while already executing a query" deprecation inside interactive transactions. It carries no data and needs a dependency upgrade to remove (revisit in M14). Every other warning prints as usual.
  - **Implemented in M9-T8:** the lookup of a `REFUND_PENDING` refund sent more than 10 minutes ago passes a refund answer through the callback code to `CompleteRefund`. An answer about an earlier attempt is recorded as ignored and counted as pending. Unsent refunds now go through the shared `RefundDispatcher`, which also finishes an immediate gateway answer.
  - With the fake gateway the CLI cannot see the web server's checkouts (separate process), so the jobs are proven with an injected gateway.

### Decision 7. Cancellation requests, decisions, refunds (M9-T7, T8)

- **M9-T7 implemented.** `RequestCancellation` accepts a manage token (G2) or the verified guest session for the reservation (G4). Only `CONFIRMED` bookings strictly before the deadline qualify. An active request or pending refund blocks submission. Q-75 applies to both entry points. A blocked phone keeps manage link read access and cannot submit. The server checks the credential and eligibility after locking the guest and reservation. Older bookings without a linked guest use the stored contact phone for the block check. The request, audit, guest receipt, and one branch email alert (Q-97) commit together. Both POSTs share the `guest-request` limit of 10 attempts per client per hour. The optional reason is single-line plain text up to 500 characters.
- **Guest detail and delivery (M9-T7).** G1 and G4 read the deadline, active or latest finished request, and available action from one database snapshot. G4 rechecks the session after that read. The receipt uses WhatsApp purpose `CANCELLATION_RECEIVED` and the guest first name, reference, and branch name. It carries no manage token. An older template requiring the link appears as a setup gap. A missing branch inbox leaves a failed outbox row. The owner accepted the single-line reason on 2026-11-24. Text formatting can be revisited with the M10 guest form.
- `DecideCancellationRequest` (`cancellations:decide`, branch scoped): reject with a reason (guest messaged); approve unpaid → `CANCELLED`, release, `COMPLETED`; approve paid → in the decision transaction the request and the payment both become `REFUND_PENDING` and `refundAttempt` increases; after commit the refund is called (key `Payment.id` plus `refundAttempt`) and `refundRequestedAt` is set. **`CompleteRefund`** is the one step that finishes a refund, used by the refund call's own result and by the refund callback, in any order, and safe to run twice (it does nothing unless the payment is `REFUND_PENDING`): success → payment `REFUNDED`, reservation `CANCELLED` and released, request `COMPLETED`, guest message; failure → payment `REFUND_FAILED` and `paymentStatus PAID`, request `REFUND_FAILED`, booking stays `CONFIRMED`, staff see it. `RetryRefund` (S45) for `REFUND_FAILED` only. Approving or rejecting a request that is not `OPEN` (including `CLOSED`) returns `409 INVALID_TRANSITION`.
- Staff cancellation of a paid booking (S9, `reservations:cancel-paid`, Manager and Admin, Q-62) creates a `CancellationRequest` with `requestedBy STAFF`, already `APPROVED`, and follows the same refund path. One refund path for both. When `notifyGuest` is true, the guest gets "cancelled and refunded" only from `CompleteRefund` on success; a refund failure sends nothing to the guest.
- **Implementation notes (M9-T8, accepted 2026-11-25; review fixes applied as recommended).**
  - One refund path: `RefundDispatcher` (after commit, 15 second limit) sends every attempt (decision, paid staff cancellation, retry, the late success automatic refund, the unsent refund sweep). A thrown or timed out call, or a stamp that cannot be written, leaves `refundRequestedAt` empty for the sweep, which resends the same key. An immediate `SUCCEEDED` or `FAILED` answer is passed to `CompleteRefund`.
  - A refund failure queues `refund.staff-alert` to the branch inbox and nothing to the guest. A refund that completes after the booking moved on (checked in) refunds the money, completes the request without cancelling, and queues `refund.moved-on-alert`. Retry is refused for such a booking.
  - Check in and no show are refused while the payment is `REFUND_PENDING` or the active request is `APPROVED` or `REFUND_PENDING`. A failed refund does not block them.
  - No migration: a staff request keeps the "tell the guest" choice as a non null guest facing `decisionReason`; its staff reason code is on its approval audit (`cancelReason`) and the `reservation.cancelled` audit links the request. M9-T11 added both columns and filled existing staff rows. New writes also keep the legacy notification text for rollback. Refund completion can recover the reason and notification choice from staff requests written by the previous release after the migration. Guest views show only guest requests.
  - A second verified success with a different transaction id queues `payment.duplicate-alert` (amount in `chargedAmount`) once per event, and is audited as `payment.double-charge-suspected`.
  - WhatsApp `CANCELLATION_APPROVED` and `CANCELLATION_REJECTED` carry no manage link. An unpaid approval sends no `refundAmount`, so the provider template must not require it (deployment guide).
  - Follow up (not in T8): a staff alert for a refund pending longer than some hours.
- `CompleteRefund` compares the result's attempt key with the key derived from the current `Payment.id` and `Payment.refundAttempt` under the reservation lock. The synchronous path supplies the key it sent with the refund call. The callback and lookup paths supply the verified event's key. Apply an outcome only to the matching pending attempt.
- **Q-96 implemented for cancellation requests (M9-T7).** Unpaid staff cancellation, no-show, and check-in set the open request to `CLOSED`. The closure reason, staff actor, time, and audit entry commit with the staff action. M9-T11 applies closure to change requests as well, including at the start of a paid staff cancellation. [Task review](../reviews/2026-11-24-m9-t7.md)
- Request creation, guest changes, and decisions all lock the reservation row, so a change cannot slip between a request and its decision; the one open request rule is checked under that lock.
- Outbox message kinds (email and WhatsApp purpose): `reservation.payment-not-completed` (`PAYMENT_NOT_COMPLETED`), `cancellation-request.received` (`CANCELLATION_RECEIVED`), `cancellation-request.approved` (`CANCELLATION_APPROVED`), `cancellation-request.rejected` (`CANCELLATION_REJECTED`), `payment.refunded` (`REFUND_COMPLETED`), `payment.auto-refunded` (`REFUND_COMPLETED`, late success wording), `change-request.received`, `.approved`, `.rejected` (`CHANGE_REQUEST_*`), and the staff email `request.staff-alert`. The dispatcher's kind list and the email templates gain each kind in the task that sends it.

### Decision 8. Guest changes and change requests (M9-T10, T11)

- As the brief items 11 and 12, on the M8 `ModifyReservation` engine. Limits: `guest-change-preview` 30 per client per 10 minutes; `guest-change` 10 per client per hour and at most 5 applied guest changes per reservation per 24 hours (owner decision D-B).
- `ChangeRequest` adds `CLOSED` and `closedReason` like `CancellationRequest` (Q-96); the staff alert applies (Q-97).
- **M9-T10 plan approved (2026-11-25).** This slice applies to confirmed, priced pay at hotel bookings the guest can already access, including staff bookings. Changed dates follow the public stay limits (Q-09). Added units must be publicly listed in the booking's branch. Existing dates and units may be kept for a contact edit. Paid changes and change requests follow in M9-T11.
- G5 returns the booking version in `ETag`. G6 requires that value in `If-Match` and returns the new version in `ETag` on success.
- **M9-T11 implemented (accepted 2026-11-25).** Compare the new total with the amount captured by the successful payment. Store the confirmed quote total and booking version on the request. A changed price, including a lower price, or a changed booking version leaves the request open with the conflict recorded. Staff may reject it so the guest can submit again. The 24 hour deadline applies at submission. Staff may approve while the booking is confirmed and both arrivals are in the future. A paid staff cancellation closes an open change request when it starts the refund. A failed refund leaves the change request closed.
- When a guest changes an existing email address, send a short security notice to the old address with the hotel's contact details. The notice contains no booking details, new address, or manage link. Replace the existing link and send the new one only to the unchanged booking phone by WhatsApp when a usable number exists. Otherwise the hotel handles recovery. This extends the existing staff contact protection in Spec 0005 and follows the access and expiry rules in ADR 019.

### Decision 9. Email verification (M9-T12, ADR 031)

As ADR 031 and the brief item 14. An email verified booking still counts against the per phone cap and the one open hold rule for the phone the guest typed (Q-60), and also against the per email cap.

Decisions from the M9-T12 plan (owner, 2026-11-25):

- **Split.** M9-T12a delivers the email code for booking (P9, P10, P7, limits, caps, coupons, the readiness gate, the migration). M9-T12b delivers the guest session by email (G3…G6) and the staff fields.
- **Guest session by email (M9-T12b; owner decisions 2026-11-26).** P9 accepts `channel: EMAIL` with `purpose: GUEST_SESSION`; the phone stays required and feeds the phone limits and the block check, never the booking lookup. The session lists and opens every booking whose current contact email equals the proven email, whatever channel verified it (those bookings already send their messages and manage links to that mailbox). G4 POST, G5 and G6 recheck the email under the reservation lock, so a booking whose email changed (by staff or by the guest) is `404`; a guest may change the email through the session, and the booking then leaves it. The contact grant `EMAIL_SESSION` compares the booking's contact email. Audit records `sessionChannel`. No lock is added: the email advisory lock stays for P9 and P7 admission only.
- **Online payment only (Q-100, implemented M9-T12c, owner 2026-11-26).** P7 returns `409 ONLINE_PAYMENT_REQUIRED` for an email booking token with `PAY_AT_HOTEL` before writing a booking or consuming the token. The guest may retry with `ONLINE`. A zero total cannot use online payment and returns `409 PAYMENT_METHOD_UNAVAILABLE`. PostgreSQL checks that new and updated email verified bookings use `ONLINE` (`Reservation_email_online_check`). P6 publishes the branch and quote payment options. M10 offers email verification for online payment only.
- **Staff fields (M9-T12b).** S2 shows `verificationChannel` (a stored null on a website booking reads as `WHATSAPP`; staff and external bookings are null) and `verifiedEmail` (with `guests:read` only). S51 shows `emailVerifiedAt`. S1 and S50 are unchanged until M11.
- **Per email cap (Q-93 and Q-100).** One open payment hold per verified email. Only `WEBSITE` bookings verified by email count, using `Reservation.verifiedEmail`, which is set at booking and survives contact edits. An email advisory lock in P7 serializes bookings for one email across different phones. The hold also counts against the cap for the phone the guest typed (known limitation L-19). Address aliases count as separate emails (L-20).
- **Phone sessions.** A WhatsApp session lists and acts only on bookings not verified by email. A booking someone made by email with a typed phone stays invisible to that phone's session. Staff and WhatsApp bookings show as before.
- **Coupons.** An email booking is quoted without a phone, so the per phone coupon limit is neither applied nor revealed, and its redemption is stored with no phone, so it never counts against the owner of that number. The coupon's total limit still applies.
- **Columns.** `Guest.phoneVerifiedAt` stays the phone verified fact (ADR 031's `phoneVerified` is not added). New: `Guest.emailVerifiedAt`, `PhoneVerification.channel` and `email`, `Reservation.verificationChannel` (null on staff and external bookings; a null on a website booking means WhatsApp, which keeps the previous release safe during a deploy).
- **Shared guest profile.** An email booking never records marketing consent for the phone and never sets `phoneVerifiedAt`. It never overwrites the name or email of an existing profile, whether its phone was verified by WhatsApp or not (for example a profile staff created at the desk; owner decision 2026-11-26, from the M9-T12a review). A new profile starts with the details the guest typed, and `emailVerifiedAt` is set only when the profile's own email is the proven one. The reservation always keeps the details the guest typed.
- **Guest messages for an email booking (owner, 2026-11-25, during M9-T12a).** A booking verified by email gets every guest message by email only. No WhatsApp message goes to its unproven phone: not the confirmation, changes, cancellations, request outcomes, or a manage link replacement. A lost manage link is recovered by the hotel, as M9-T10 already does when no usable phone exists. Staff confirm the phone on arrival.
- **Admin switch for email verification (Q-99, M9-T12a, amended by Q-100 in M9-T12c).** The global `emailVerificationEnabled` setting defaults off. Only an Admin (`settings:edit`) can change it through API-A9 or the admin settings page. Changes are audited. Enabling it requires configured email delivery and a payment gateway. Turning it off stops new email codes immediately (P9 `503 EMAIL_NOT_CONFIGURED`). An already issued code can be confirmed during its 10 minute lifetime. The resulting booking token can be used during its 30 minute lifetime while the branch allows online booking and online payment is available, including when WhatsApp is unavailable (owner decision, 2026-11-26).
- **Booking readiness.** A3 checks for ready WhatsApp or ready email with online payment available. Online payment needs a configured gateway and the branch payment switch on. P7 applies the same readiness rule and also lets a guest with a valid email booking token finish online when the branch can take online payment. If no channel can be used, P7 returns `409 BRANCH_NOT_BOOKABLE` with `VERIFICATION_NOT_CONFIGURED`. P9 checks readiness of the requested channel and returns `503 WHATSAPP_NOT_CONFIGURED` or `503 EMAIL_NOT_CONFIGURED` when it cannot issue a code. Email delivery and the Admin switch control P9 availability for both purposes.
- **Code fingerprint.** Email codes are bound to id, phone, purpose, channel, and email. WhatsApp codes keep the M8 binding, so codes issued before a deploy still confirm.
- **Lock order.** Phone advisory lock, guest row, email advisory lock, verification row.
- **Email text** (placeholder until Q-30): subject "Your verification code"; body "Your Rivana Residence code is 123456. It expires in 10 minutes. If you did not ask for it, ignore this email." No link, no booking or branch details.

### Decision 10. Authorization, audit, logging

- Capabilities exist: `reservations:cancel-paid` and `cancellations:decide` (Manager, Admin); every staff use case calls `authorize` or `authorizeBranch` from the `auth` index. The sweep pattern of M8 (role by scope matrix per surface) extends to every new use case.
- Audit actions: `payment.confirmed`, `payment.expired`, `payment.failed`, `payment.refund-requested`, `payment.refunded`, `payment.refund-failed`, `cancellation-request.created`, `.approved`, `.rejected`, `.closed`, `change-request.created`, `.approved`, `.rejected`, `.closed`, `branch.updated` (switch).
- Logs carry ids, kinds, and outcomes only: never a payload, card data, signature, token, guest name, email, or phone (captured log tests as in M8).

## Rationale

The hard parts of payments are the same for every provider: holds, idempotency, late and duplicate results, refunds, and honest messages. Building them once against a faithful fake and proving them with contract suites removes the wait for accounts and keeps the client's choice a launch task (ADR 030). The ADR 025 flow keeps the inventory rule in PostgreSQL, where ADR 016 already proves it, and turns the one remaining race (a late success) into an explicit, tested path.

Keeping the hold across a declined attempt (Q-95) matches how hosted checkouts behave and avoids releasing a room the guest is still paying for; the 2 minute gap between session end and hold end means a payment in progress never lands after release in the normal case. Held outbox rows solve the manage link gap without storing a raw token or rotating it under the guest's feet. One refund path for guest approvals and staff cancellations means one place to get refunds right.

## Feature design

**Data model sketch** (new or changed in M9):

| Entity | Key fields | Relationships and constraints |
| --- | --- | --- |
| `Branch` (changed) | `onlinePaymentEnabled` bool, default false | Admin switch (Q-94) |
| `Reservation` (existing) | `paymentMethod` (`PAY_AT_HOTEL`, `ONLINE`), `status`, `paymentStatus` (gains `FAILED`), `holdExpiresAt` | DB-16 check |
| `Payment` | id (merchant reference), reservationId, provider, providerOrderId?, providerTransactionId? unique, checkoutUrl?, amountMinor, currency, status, expiresAt, refundAttempt, refundRequestedAt?, refundProviderId?, refundedAt?, lastError? | N:1 reservation; one `INITIATED` per reservation |
| `PaymentEvent` | id, paymentId?, providerEventId unique, kind, outcome, result, amountMinor?, currency?, receivedAt | N:1 payment; no payload |
| `CancellationRequest` | id, reservationId, requestedBy, status, guestReason?, decidedById?, decidedAt?, decisionReason?, closedReason? | N:1 reservation; one `OPEN` per reservation |
| `ChangeRequest` (T11) | as data model, plus `CLOSED`, closedReason | N:1 reservation; one open request of either kind per reservation (checked under the reservation lock) |
| `NotificationOutbox` (changed) | status gains `HELD` | held rows are never claimed by the dispatcher |
| `PhoneVerification`, `Guest` (T12) | `channel`, `email`; `phoneVerified`, `emailVerifiedAt` | ADR 031 |

**State transitions**:

- Reservation: `AWAITING_PAYMENT → CONFIRMED` (verified success) · `AWAITING_PAYMENT → PAYMENT_FAILED` (expiry, session closed, checkout creation failed) · `PAYMENT_FAILED → CONFIRMED` (late success, units free) · `CONFIRMED → CANCELLED` (approved request, staff cancellation; after refund when paid).
- Payment: `INITIATED → SUCCEEDED | EXPIRED | FAILED`; `EXPIRED | FAILED → SUCCEEDED` (late success, PY-5); `SUCCEEDED → REFUND_PENDING → REFUNDED | REFUND_FAILED`; `REFUND_FAILED → REFUND_PENDING` (retry). A late success that cannot be confirmed (PY-5) is automatic refund in two steps: `SUCCEEDED`, then `REFUND_PENDING`.
- Cancellation request: `OPEN → APPROVED → COMPLETED` (unpaid) · `OPEN → APPROVED → REFUND_PENDING → COMPLETED | REFUND_FAILED → REFUND_PENDING` · `OPEN → REJECTED` · `OPEN → CLOSED` (Q-96).
- Change request: `OPEN → APPROVED` (applied) · `OPEN → REJECTED` · `OPEN → CLOSED`; a failed approval re-check leaves it `OPEN` with `lastConflict`.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
| --- | --- | --- | --- | --- | --- |
| P6 `/api/v1/quotes` (changed) | POST | as M8 | adds `paymentMethods` | public | as M8 |
| P7 `/api/v1/reservations` (online) | POST | `paymentMethod: "ONLINE"`, `Idempotency-Key` | `201 { reference, status: AWAITING_PAYMENT, holdExpiresAt, checkoutUrl, manageUrl }` | public, verified token | `409 PAYMENT_METHOD_UNAVAILABLE`, `429 BOOKING_LIMIT_REACHED` (open hold), `503 PAYMENT_UNAVAILABLE` |
| P8 `/api/v1/payments/callback` | POST | raw body, headers, URL | `200` | adapter signature | `401 WEBHOOK_SIGNATURE_INVALID` |
| G2, G4 `…/cancellation-requests` | POST | `reason?` | `201 CancellationRequestDto` | manage token / guest session | `409 CANCELLATION_WINDOW_CLOSED`, `409 CANCELLATION_REQUEST_EXISTS`, `409 INVALID_TRANSITION` |
| G5 change preview | POST | `GuestChangeInput` | `200` with the current and proposed quotes, outcome, and booking `ETag` | manage token / guest session | `403 CHANGE_NOT_ALLOWED`, `422 VALIDATION` |
| G6 apply or request approval | POST | `GuestChangeInput`, `If-Match`, `expectedTotal` | `200 GuestReservationDto` with new version or `202 ChangeRequestDto` with the same version | manage token / guest session | `403 CHANGE_NOT_ALLOWED`, `409 PRICE_CHANGED`, `409 INVENTORY_UNAVAILABLE`, `412 STALE_VERSION`, `428 PRECONDITION_REQUIRED` |
| S9 paid path | POST | `reason`, `notifyGuest` | `202` | `reservations:cancel-paid` | `403`, `409 INVALID_TRANSITION` |
| S17, S56 queues | GET | `branchId`, `status`, `page` | paged lists | `cancellations:decide` | `403`, `404` |
| S18, S19, S57, S58 decisions | POST | `note?` / `reason` | `200` / `202` | `cancellations:decide` + branch | `409 INVALID_TRANSITION`, `409 INVENTORY_UNAVAILABLE` (S57) |
| S44 payments | GET | — | `PaymentDto[]` | `reservations:read` | `404` |
| S45 refund retry | POST | — | `202` | `cancellations:decide` | `409 INVALID_TRANSITION` |
| A3 branch (changed) | PATCH | `onlinePaymentEnabled` | branch | `branches:manage` | `422` (no gateway ready) |
| P9 (T12) | POST | `channel`, `email` | as M8 | public | `503 EMAIL_NOT_CONFIGURED` |
| `/dev/fake-checkout/[paymentId]` | GET, POST | scenario | page, signed callback to P8 | dev only | `404` in production or with a real provider |

**Value sourcing**:

| Action | Value | Source |
| --- | --- | --- |
| P7 online | `holdExpiresAt` | clock now + 15 minutes (`HoldPolicy`) |
| P7 online | payment `expiresAt` | `holdExpiresAt` minus 2 minutes |
| P7 online | checkout amount and currency | `Reservation.totalMinor` and its currency snapshot (USD, Q-54) |
| P7 online | merchant reference | `Payment.id` |
| P7 online | `returnUrl` | `APP_URL` + `/{branchSlug}/book/payment` (the M10 return page) |
| P7 online | customer name and email | the booking's guest input |
| P7 replay | `checkoutUrl` | `Payment.checkoutUrl` |
| P6, P7 | allowed methods | gateway readiness reader + `Branch.onlinePaymentEnabled` + quote total |
| P8 | event identity, outcome, amount, currency, refund attempt key | the adapter's normalized event |
| P8 | expected amount and currency | `Payment.amountMinor`, `Payment.currency` |
| Confirmation message | manage link | held outbox row written at creation (Decision 4) |
| G2, G4 | deadline | `Branch.checkInTime`, `Branch.timeZone`, reservation check-in (`CancellationDeadline`) |
| G2 refusal | branch contact details | `Branch.phone`, `Branch.email` |
| Refund | amount | `Payment.amountMinor` (full, PY-7) |
| Refund | idempotency key | `Payment.id` plus `Payment.refundAttempt` |
| Staff alert | recipient | branch contact email (as M8) |
| Q-96 close | reason, user | the calling use case and its principal |

**Key invariants**:

- A reservation is `CONFIRMED` only after a verified success or at creation for pay at hotel; never on a browser return.
- Each `providerEventId` is processed once; state changes only from the expected states.
- `AWAITING_PAYMENT` always has `ONLINE` and `holdExpiresAt` (DB-16); at most one open hold per phone; at most one `INITIATED` payment per reservation.
- Held messages are dispatched only after a confirming commit; they are deleted once the payment is known to be unpaid for good, never dispatched for an unconfirmed booking.
- At most one open request (cancellation or change) per reservation.
- A paid booking becomes `CANCELLED` only after the gateway confirms the refund.
- Lock order stays guest row, listings by id, coupon row, reservation rows; no path takes a listing lock after a reservation lock (Decision 5).
- An event id is final only when its `PaymentEvent.result` is `APPLIED`; ignored events can be applied by a genuine retry.
- A refund is finished only by `CompleteRefund` for the matching pending attempt. Repeated or stale outcomes leave the current state intact.

**Security model**: P8 requires adapter verification and matching amount and currency. Refund outcomes also require the active attempt key. Guest requests go through the manage token or the guest session for the reservation's phone (ADR 019); blocked phones cannot request or change (Q-75). Decisions, paid cancellation, and refund retry need `cancellations:decide` or `reservations:cancel-paid` and the branch (Manager, Admin). Receptionists cannot cancel paid bookings (AC-8). The branch switch is Admin only. PCI scope: hosted checkout, no card data. Audit is mandatory for every money and request change.

**Configuration required**:

- `PAYMENT_PROVIDER`: payment adapter name (`fake` only before launch; refused in production).
- `PAYMENT_FAKE_SECRET`: optional signing secret of the fake gateway (development default when unset).
- `EMAIL_PROVIDER`: `smtp` or `fake` (refused in production).
- No real provider secrets in M9.
- Cron: `expire-holds` every minute, `reconcile-payments` every 5 minutes.

**Critical test scenarios**:

- Happy path: online booking → simulated checkout success → `CONFIRMED`, held messages released, verifies **AC-1**, **AC-10**.
- Declined then success within the hold; abandonment → expiry → `PAYMENT_FAILED`, verifies **AC-4**.
- Forged, altered, duplicate (×5 in parallel) callbacks, verifies **AC-2**, **AC-3**.
- Hold expiry racing a booking and a success; late success after resale → refund and alert, verifies **AC-5** (C-12, C-14).
- Request before and after the deadline, second request, decisions, refund pending, failed, retried, verifies **AC-6**, **AC-7**.
- Receptionist paid cancellation refused, verifies **AC-8**; full authorization sweep for every new use case.
- Captured logs and bundle check, `fake` refused in production, verifies **AC-9**.
- Guest changes and change requests including C-16 and C-17, verifies **AC-11**, **AC-12**.
- Email verification, verifies **AC-13**; branch switch and `paymentMethods`, verifies **AC-14**; staff cancel, no-show, check-in close open requests, verifies **AC-15**; staff alert queued, verifies **AC-16**.

## Build plan

Execution order (ids kept from the brief): T0b → T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T10 → T11 → T12a → T12b → T12c. Messages are built inside the task that sends them (proposed change D-C), so every "messaged" criterion is proven in its own task.

1. **M9-T0b** adapter foundations: `EMAIL_PROVIDER`, fake email adapter, `fake` refusal for all kinds, WhatsApp and email contract suites, readiness reader, satisfies **AC-9**, **AC-10**.
2. **M9-T1** migration `payments_and_cancellations` (Decision 2), satisfies **AC-1**, **AC-6**, **AC-14**, **AC-15**.
3. **M9-T2** domain rules (Decision 3), satisfies **AC-4**, **AC-6**, **AC-14**, **AC-15**.
4. **M9-T3** `PaymentGateway` port, registry, fake gateway, simulated checkout page, payment contract suite, satisfies **AC-9**, **AC-10**.
5. **M9-T4** online booking path, held messages, in transaction expiry, P6 `paymentMethods`, branch switch, satisfies **AC-1**, **AC-4**, **AC-14**.
6. **M9-T5** payment callback, late success, security review, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**.
7. **M9-T6** hold expiry and reconciliation jobs, satisfies **AC-4**, **AC-5**, **AC-10**.
8. **M9-T7** guest cancellation requests, staff alert, Q-96 closing for cancellation requests, satisfies **AC-6**, **AC-15**, **AC-16**.
9. **M9-T8** decisions, refunds, retry, paid staff cancellation, satisfies **AC-7**, **AC-8**, **AC-10**.
10. **M9-T10** guest changes, pay at hotel, satisfies **AC-11**.
11. **M9-T11** change requests, migration `change_requests`, staff alert and Q-96 closing for change requests, satisfies **AC-12**, **AC-15**, **AC-16**.
12. **M9-T12a** email code for booking, migration `verification_channels`, and **M9-T12b** email guest session and staff fields (split 2026-11-25), together satisfy **AC-13**.

## Task breakdown (approved 2026-11-22)

| Task | Title | Risk | Depends on | Covers | Status |
| --- | --- | --- | --- | --- | --- |
| M9-T0 | Public surface for `auth` | Medium | M8 | D-8 | Accepted (2026-11-22) |
| M9-T0b | Adapter foundations (ADR 030) | Medium | T0 | AC 9, 10 | [Task status in the brief](../delivery/milestones/m9-payments-and-cancellations.md#task-breakdown) |
| M9-T1 | Migration `payments_and_cancellations` (enum rename, branch switch, `Payment`, `PaymentEvent`, `CancellationRequest`, outbox `HELD`) | Critical | T0 | AC 1, 6, 14, 15; drift check | [Task status in the brief](../delivery/milestones/m9-payments-and-cancellations.md#task-breakdown) |
| M9-T2 | Domain: payment transitions, `HoldPolicy`, `CancellationDeadline`, `PaymentMethodAvailability`, PY, CX, GC, Q-96 rules | Critical | T0 | AC 4, 6, 14, 15; T-PAY-1…4, T-CXL-1…3 | Not started |
| M9-T3 | `PaymentGateway` port, registry, fake gateway, simulated checkout page, payment contract suite | Critical | T0b | AC 9, 10; T-ADP | Not started |
| M9-T4 | Online booking path: `AWAITING_PAYMENT`, hold, held messages, checkout creation and failure, replay, in transaction expiry, P6 `paymentMethods`, A3 switch | Critical | T1, T2, T3 | AC 1, 4, 14; T-PAY-5 | [Task status in the brief](../delivery/milestones/m9-payments-and-cancellations.md#task-breakdown) |
| M9-T5 | Payment callback P8, idempotency, late success, mid milestone security review | Critical | T4 | AC 1, 2, 3, 5; C-12, C-13 | [Task status in the brief](../delivery/milestones/m9-payments-and-cancellations.md#task-breakdown) |
| M9-T6 | Hold expiry and reconciliation jobs | Critical | T5 | AC 4, 5, 10; C-14 | Accepted (2026-11-24) |
| M9-T7 | Guest cancellation requests (G2, G4), staff alert, Q-96 closing | Critical | T1, T2 | AC 6, 15, 16; T-CXL-4…5 | Accepted (2026-11-24) |
| M9-T8 | Decisions and refunds (S9 paid, S17…S19, S44, S45) | Critical | T5, T7 | AC 7, 8, 10; T-PAY-8…10, T-CXL-6…8 | Accepted (2026-11-25) |
| M9-T9 | Merged into T4…T11 (each task sends its own messages) | — | — | — | Merged (D-C) |
| M9-T10 | Guest changes, pay at hotel (G5, G6) | Critical | T2, M8-T9b, M8-T11 | AC 11; T-GCHG-1…8, C-16 | [Task status in the brief](../delivery/milestones/m9-payments-and-cancellations.md#task-breakdown) |
| M9-T11 | Change requests for paid bookings (S56…S58), migration `change_requests` | Critical | T10, T8 | AC 12, 15, 16; T-GCHG-9…12, C-17 | [Task status in the brief](../delivery/milestones/m9-payments-and-cancellations.md#task-breakdown) |
| M9-T12a | Email code for booking, migration `verification_channels` | Critical | T0b, M8-T5, M8-T7b, M8-T11 | AC 13 (except the email session); T-VCH-1…5, 7, 8 | [Task status in the brief](../delivery/milestones/m9-payments-and-cancellations.md#task-breakdown) |
| M9-T12b | Email guest session and staff fields | Critical | T12a | AC 13 (email session); T-VCH-6 | [Task status in the brief](../delivery/milestones/m9-payments-and-cancellations.md#task-breakdown) |
| M9-T12c | Email verification only with online payment (Q-100) | Critical | T12a, T12b, T4 | AC 13 as amended by Q-100 | [Task status in the brief](../delivery/milestones/m9-payments-and-cancellations.md#task-breakdown) |

Changes from the brief: T9 merged into the tasks that send each message (D-C); T4 also carries the branch switch and P6 `paymentMethods` (Q-94); T7 and T11 carry the staff alert (Q-97) and the closing rule (Q-96); T1 adds `onlinePaymentEnabled`, `checkoutUrl`, `EXPIRED`, `requestedBy`, `CLOSED`, and outbox `HELD`; T5 carries the mid milestone security review.

## Consequences

**Positive**:

- No milestone waits for a provider; launch work is one adapter per provider plus its contract suite.
- One refund path for guest approvals and staff cancellations; one callback processor for webhooks and reconciliation.
- Guests can retry a declined card without losing the room.

**Negative / tradeoffs**:

- The fake gateway and the simulated checkout page are real code to maintain, and a provider quirk can still appear at launch.
- `HELD` outbox rows add a fourth status and amend R-10's wording.
- The 2 minute gap shortens the time a guest has to pay to about 13 minutes.
- Production cannot take online payments until M15-T4 plugs in a real gateway.

**Neutral**:

- Three migrations (`payments_and_cancellations`, `change_requests`, `verification_channels`), all additive except the enum value rename.
- New cron entries and environment variables in the deployment guide.
- ADR 025 (Q-95) and R-10 (D-A) get short amendments; Q-94…Q-97 join the question register.

## Follow-up

- [ ] On approval: record Q-94…Q-97, amend ADR 025 step 3 (Q-95), R-10 (D-A), and the lifecycle row "create website, online" ("same writes except confirmations" becomes "confirmations written as held rows"), and update the brief's task table and criteria to match this spec.
- [x] M9-T10: add `CHANGE_NOT_ALLOWED` to the error model (the other M9 codes are already listed there).
- [x] M9-T10 plan: send the old address a minimal security notice (Decision 8).
- [x] M9-T12 plan: confirm the per email cap default (Q-93): 2 upcoming pay at hotel bookings and 1 open hold per email (2026-11-25).
- [ ] `docs/domain/reservation-lifecycle.md`, `api-contracts.md`, `data-model.md`, `integrity-and-concurrency.md`, `test-matrix.md`, and OpenAPI get their Implemented marks task by task.
- [ ] The mid milestone security review file is `docs/reviews/<date>-m9-security.md` (with T5).

## Decisions for the owner (all approved as recommended, 2026-11-22)

- **D-A. Held confirmation messages.** Write the online booking's confirmation rows at creation as `HELD` (they carry the manage link, which exists only then), release them in the confirming transaction (also on a late success), and delete them once the payment is known to be unpaid for good (reconciliation, or 24 hours after the hold ended). Runner up: rotate the manage token at confirmation (breaks the payment return page, which polls with the first token).
- **D-B. Guest change limits.** Preview 30 per client per 10 minutes; apply 10 per client per hour; at most 5 applied guest changes per reservation per 24 hours. Cancellation requests 10 per client per hour.
- **D-C. Merge M9-T9 into the tasks.** Each task builds and tests the messages it sends, instead of one message task at the end.
- **D-D. Gateway session ends 2 minutes before the hold.** Runner up: session and hold end together (a payment finishing in the last seconds then goes through the late success path).
- **D-E. One refund path.** A paid staff cancellation creates an already approved `CancellationRequest` with `requestedBy STAFF`.

## Cross check (2026-11-22)

An independent read only review on Claude Sonnet 5.5 (the spec was written on Opus 5.5) rated the design sound and found 5 major and 8 minor gaps. The owner chose to apply every recommended fix: ambiguous checkout failures keep the hold, the held row cleanup rule, one lock rule for every path, `PaymentEvent.result`, refund matching and the idempotent `CompleteRefund`, `refundAttempt` and `refundRequestedAt`, named message kinds, `409 INVALID_TRANSITION` on a closed request, the reservation `paymentStatus` mapping (with `FAILED`), the deadline at request time, email bookings counting against the phone cap, the guest message after a paid staff cancellation only on refund success, stable event ids, and the reservation lock for requests and changes. One reported gap was wrong: the M9 error codes are already in the error model, except `CHANGE_NOT_ALLOWED` (added in M9-T10).
