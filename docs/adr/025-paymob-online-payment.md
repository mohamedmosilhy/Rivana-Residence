# ADR 025 — Online payment through Paymob hosted checkout, with payment holds and refunds

Status: **Accepted** (2026-11-06, client decisions Q-37, Q-38, Q-54, Q-55). The Paymob account charges in US dollars (Q-54); the client supplies the sandbox and live keys when M9 starts (Q-55). Extends [ADR 016](./016-inventory-and-concurrency.md) and [ADR 024](./024-immediate-confirmation.md). Replaces the "pay at hotel only" recommendation (Q-08).

## Context

The accepted design stored `PAY_AT_HOTEL` on every reservation and excluded online payment. The client now wants guests to choose between paying online through Paymob or paying at the hotel, and wants approved cancellation requests refunded through Paymob. Rivana must never handle card data, must not confirm a booking whose payment did not succeed, and must not charge a guest for a room it cannot give.

## Problem

How do we take payments and refunds with Paymob, keep the inventory consistent while the guest is on the payment page, and keep every state truthful when callbacks arrive late, twice, or not at all?

## Options considered

1. **Pay first, then reserve.** Simple, but a guest can be charged for a room that sold meanwhile, which forces automatic refunds in normal operation.
2. **Embedded card form or Paymob iframe on Rivana pages.** Card fields inside Rivana's origin raise PCI scope; an iframe needs a CSP `frame-src` exception and complicates accessibility.
3. **Reserve, then redirect to Paymob's hosted checkout; confirm on the verified server-to-server result.**

## Decision

Option 3.

**Flow**

1. The guest submits the booking with `paymentMethod: "PAYMOB"`. In one transaction (lock, count, price, coupon check, ADR 016 and ADR 027) Rivana creates the reservation as `AWAITING_PAYMENT` with `holdExpiresAt = now + 15 minutes`. The status consumes inventory and the coupon redemption, so nobody else can take the last unit while the guest pays.
2. After commit, Rivana creates a Paymob payment session (an intention or order) for the exact total in USD minor units (supported by the account, Q-54), carrying Rivana's payment id as the merchant reference, and set to expire before the hold. It stores the Paymob identifiers on a `Payment` row and returns the hosted checkout URL. The browser navigates there; no Paymob script or frame runs on Rivana pages, so the CSP is unchanged.
3. Paymob calls Rivana's webhook (`POST /api/v1/payments/paymob/callback`). The handler verifies the HMAC with the server-only secret, rejects unsigned or mismatched payloads, records the event once (unique provider transaction id), and in one transaction locks the reservation and:
   - on success with the expected amount and currency, sets the payment `SUCCEEDED` and the reservation `CONFIRMED`, and queues the confirmation messages (ADR 024);
   - on failure, sets the payment `FAILED` and the reservation `PAYMENT_FAILED`, which releases inventory and the coupon redemption.
4. The browser's return from Paymob only shows the current server state. Its query parameters are never trusted to confirm anything.
5. A scheduled job (every minute) expires holds past `holdExpiresAt`: `AWAITING_PAYMENT` becomes `PAYMENT_FAILED` under the reservation lock. The booking transaction also expires overdue holds of the same room type while it holds the room-type lock, so an abandoned hold never blocks a new booking for long.
6. A success result that arrives after its hold expired is processed under the room-type lock: if the inventory is still free the reservation is confirmed; otherwise Rivana requests a full refund automatically, tells the guest, and alerts staff (Q-63).

**Refunds**

- Approving a cancellation request for a paid booking (Manager of the branch or Admin, ADR 024), or a staff cancellation of a paid booking (Q-62), creates a refund through Paymob's refund API for the captured amount. The reservation becomes `CANCELLED` when Paymob confirms the refund (synchronously or by callback). A failed refund leaves the reservation `CONFIRMED` with the request in `REFUND_FAILED`, visible to staff with a retry action.
- Rivana does not calculate processing fees. Whether Paymob deducts a fee is Paymob's policy; the guest-facing wording needs client approval (Q-30).
- Partial refunds are not offered in v1. Price changes on prepaid bookings are settled at the hotel desk (Q-66).

**Ports and data**

- `PaymentGateway` application port (`createCheckout`, `verifyCallback`, `refund`, `getTransaction`), with a Paymob adapter in `src/infrastructure/payments/paymob/`. Provider SDKs and payloads stay in the adapter. A fake adapter serves tests and local development.
- Tables: `Payment` (one per payment attempt), `PaymentEvent` (raw verified callbacks, deduplicated), and refund fields on `Payment` and `CancellationRequest` ([data model](../database/data-model.md)).
- Secrets (API key, secret key, HMAC secret, integration ids) are server-only environment variables, supplied by the client when M9 starts (Q-55). They are never entered in the dashboard or stored in the database.

## Rationale

Reserving before paying keeps the inventory rule in PostgreSQL, where ADR 016 already proves it, and turns the only race left (a late success) into an explicit, tested path. A hosted checkout keeps card data out of Rivana (PCI SAQ A scope) and needs no CSP change.

## Consequences

- New statuses `AWAITING_PAYMENT` and `PAYMENT_FAILED`. `AWAITING_PAYMENT` consumes inventory; `PAYMENT_FAILED` is terminal and releases it.
- A new public webhook endpoint that accepts unauthenticated requests whose only proof is the HMAC. It is exempt from the browser CSRF check and covered by its own tests.
- Revenue figures can distinguish captured payments from pay-at-hotel amounts.
- Staff bookings stay pay-at-hotel (Q-37).

## Risks

- Keys arrive late (Q-55). Mitigation: M8 and earlier use the fake gateway; M9 starts when the sandbox keys arrive; pay at hotel works without Paymob.
- Callbacks are lost. Mitigation: the return page and a reconciliation job query the transaction through `getTransaction` for holds that have a Paymob session but no result.
- Duplicate or replayed callbacks. Mitigation: HMAC, unique transaction id, idempotent state transitions.
