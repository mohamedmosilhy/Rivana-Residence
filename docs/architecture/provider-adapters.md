# Provider adapters: payment, WhatsApp, email

**Partly implemented.** All three ports have fake adapters and shared contract suites. M9-T3 added the payment gateway port, fake gateway, simulated checkout, and payment readiness. M9-T4 added hosted checkout creation and recovery to online booking. M9-T5 added the payment webhook (`POST /api/v1/payments/callback`) with verification, idempotent events, late success and the automatic refund request. Launch adapters follow the client’s provider choices in M15-T4. [ADR 030](../adr/030-provider-neutral-integrations.md)

The rule: **Rivana owns the logic; an adapter only translates.** If a change to a provider would touch a use case, a Route Handler, or a table, the port is wrong, not the adapter.

## The three ports

| Kind | Port (module) | Calls | Selected by | Fake adapter | Real adapter lives in |
| --- | --- | --- | --- | --- | --- |
| Online payment | `PaymentGateway` (`src/application/payments`) | `createCheckout`, `verifyCallback`, `getTransaction`, `refund` | `PAYMENT_PROVIDER` | Implemented (M9-T3), with a simulated checkout page | `src/infrastructure/payments/<provider>/` |
| WhatsApp | `WhatsAppTransport` (`src/application/notifications`) | `deliver` | `WHATSAPP_PROVIDER` (`meta`, `fake`) | Implemented (M8-T4) | `src/infrastructure/whatsapp/` |
| Email | `ReservationEmailSender` (`src/application/notifications`) | `send` | `EMAIL_PROVIDER` (`smtp`, `fake`) | Implemented (M9-T0b) | `src/infrastructure/email/` |
| Email codes | `VerificationCodeEmail` (`src/application/notifications`) | `send({ id, to, code })` | `EMAIL_PROVIDER` (same adapter choice) | Implemented (M9-T12a, ADR 031) | `src/infrastructure/email/verification-code-email.ts` |

Adapters are constructed in `src/composition` from the environment. `readProviderReadiness()` reports `unconfigured`, `fake`, or `real` per kind using configuration alone. WhatsApp reports transport readiness, and branch settings and templates still govern sending. Payment reports `fake` in development and test with the fake gateway selected. Production reports `unconfigured` until a real gateway is registered and selected. An unconfigured adapter is a setup gap.

## What stays in Rivana (never in an adapter)

Reservation and payment state, holds and expiry, amount and currency checks, idempotency and duplicate handling, late success handling, reconciliation, refund state and retry, the outbox with retries and scrubbing, template purposes and variable allowlists, verification codes and limits, setup gaps and readiness gates, audit, and authorization.

## What an adapter does

- **Payment.** Create a hosted checkout for the exact amount and currency using Rivana's payment ID as the merchant reference. Verify incoming webhooks and return a normalized event or a rejection. Transaction outcomes are `SUCCEEDED`, `DECLINED`, and `SESSION_CLOSED`. Refund outcomes are `REFUND_SUCCEEDED` and `REFUND_FAILED`. Every normalized refund callback or lookup result includes the original request's idempotency key as `refundAttemptKey`. Look up a transaction and request a full refund through the same port. [Spec 0006](../specs/0006-m9-payments-and-cancellations.md#decision-1-ports-adapters-and-readiness-m9-t0b-t3-adr-030)
- **Checkout retries.** Concurrent and repeated calls for one payment ID reuse the existing checkout. Return `PROVIDER_REJECTED` only for a final refusal for the whole ID, including concurrent calls and retries. Return `UNAVAILABLE` when the outcome is uncertain so Rivana can preserve the hold and retry safely. [Payment gateway contract](../../tests/contract/payment-gateway.test.ts)
- **WhatsApp.** Send a template message (name, language, ordered variables) to an E.164 number and return the provider message id or a mapped failure code (`RATE_LIMITED`, `UNAVAILABLE`, `TEMPLATE_MISSING`, rejected, and so on).
- **Email.** Send a rendered message to an address and return success or a mapped failure code. Rendering stays in Rivana.

A payment provider needs hosted checkout, verifiable server to server results, and a refund API. Its adapter must be able to recover the original attempt key from trusted provider data. WhatsApp needs template messages and email needs authenticated sending. A provider without these capabilities requires a new decision. [ADR 030](../adr/030-provider-neutral-integrations.md)

## Simulated checkout

The fake gateway returns `/dev/fake-checkout/[paymentId]` for a checkout it has registered. Its form posts to `/dev/fake-checkout/[paymentId]/submit`. The form sends a scenario choice and the gateway takes the amount and currency from its checkout record. It sends a signed callback to P8 over HTTP at the configured app origin. Both routes require the fake gateway in development or test and return `404` in production.

Checkout, transaction, and refund records live in one server process and reset on restart. The M9-T3 browser proof used a test receiver at the P8 path. M9-T5 added the reservation webhook. The M9-T6 reconciliation job runs in a separate CLI process, so with the fake gateway its `getTransaction` cannot see a checkout made by the web server and answers `NOT_FOUND`. The job is proven with an injected gateway in integration tests. A real adapter answers from the provider, which is what reconciliation needs.

## Contract tests

Each port has one shared suite that every adapter must pass. `npm run test` runs the messaging suites against both fakes and the existing Meta and SMTP adapters with stubbed provider responses. The fake email adapter keeps the latest 100 successful deliveries in process memory. The payment suite covers invalid signatures, repeated requests, exact amounts and currencies, expiry, refund idempotency, and a delayed failure from an earlier refund attempt. [WhatsApp transport](../../tests/contract/whatsapp-transport.test.ts) · [Reservation email](../../tests/contract/reservation-email.test.ts) · [Verification code email](../../tests/contract/verification-code-email.test.ts) · [Payment gateway](../../tests/contract/payment-gateway.test.ts)

## Environment variables

| Variable | Meaning | Rule |
| --- | --- | --- |
| `PAYMENT_PROVIDER` | Payment adapter name | Defaults to `fake` in development and test. Unset in production until a real gateway is available |
| `PAYMENT_FAKE_SECRET` | Server signing secret for simulated callbacks | Optional, with a fixed development default. Configured values must have at least 32 characters |
| `WHATSAPP_PROVIDER` | WhatsApp adapter name (`meta`, `fake`) | Defaults to `fake` in development and test and `meta` in production. Meta transport requires `WHATSAPP_ACCESS_TOKEN` |
| `EMAIL_PROVIDER` | Reservation email adapter name (`smtp`, `fake`) | Defaults to `fake` in development and test and `smtp` in production. Select `smtp` explicitly when sending locally. SMTP requires `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, and `CONTACT_FROM`. `CONTACT_DELIVERY` controls contact enquiries independently |
| Provider secrets (for example an API key, webhook secret, access token) | Read only by that provider's adapter | Server only, never in the dashboard or database; the client bundle check covers them |

`NODE_ENV=production` rejects an explicit `fake` selection for all three kinds. Set it for [production reservation cron jobs](../database/migrations-and-seeding.md#scheduled-jobs-cron).

## Adding a real provider (launch, M15-T4)

1. Read the provider's current documentation and note the API version and fields used in the milestone report.
2. Write the adapter file in `src/infrastructure/<kind>/<provider>/` and register its name in the composition registry.
3. Run the kind's contract suite against it; add provider specific tests for its error mapping and webhook format.
4. Set the environment variables on the server (`.env.local` locally), register the callback URL for a payment gateway, and run the Admin test message for WhatsApp and email.
5. Run the provider's sandbox: for payment, pay, fail, abandon, late success, and refund; then one live low value payment and refund before launch.
6. Record the result in the launch evidence, and add the provider's name to the privacy notice where it receives guest data (Q-30).
