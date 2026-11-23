# Provider adapters: payment, WhatsApp, email

**Partly implemented.** M8 added the WhatsApp and reservation email ports. M9-T0b added `EMAIL_PROVIDER`, the fake email adapter, provider readiness, shared messaging contract suites, and production validation for all three selectors. The payment port, fake gateway, and payment contract suite are planned in M9-T3. Launch adapters follow the client’s provider choices in M15-T4. [ADR 030](../adr/030-provider-neutral-integrations.md)

The rule: **Rivana owns the logic; an adapter only translates.** If a change to a provider would touch a use case, a Route Handler, or a table, the port is wrong, not the adapter.

## The three ports

| Kind | Port (module) | Calls | Selected by | Fake adapter | Real adapter lives in |
| --- | --- | --- | --- | --- | --- |
| Online payment | `PaymentGateway` (`src/application/payments`) | `createCheckout`, `verifyCallback`, `getTransaction`, `refund` | `PAYMENT_PROVIDER` | Planned (M9-T3), with a simulated checkout page | `src/infrastructure/payments/<provider>/` |
| WhatsApp | `WhatsAppTransport` (`src/application/notifications`) | `deliver` | `WHATSAPP_PROVIDER` (`meta`, `fake`) | Implemented (M8-T4) | `src/infrastructure/whatsapp/` |
| Email | `ReservationEmailSender` (`src/application/notifications`) | `send` | `EMAIL_PROVIDER` (`smtp`, `fake`) | Implemented (M9-T0b) | `src/infrastructure/email/` |

Adapters are constructed in `src/composition` from the environment. `readProviderReadiness()` reports `unconfigured`, `fake`, or `real` per kind using configuration alone. WhatsApp reports transport readiness, and branch settings and templates still govern sending. Payment reports `unconfigured` until M9-T3 registers the gateway. An unconfigured adapter is a setup gap.

## What stays in Rivana (never in an adapter)

Reservation and payment state, holds and expiry, amount and currency checks, idempotency and duplicate handling, late success handling, reconciliation, refund state and retry, the outbox with retries and scrubbing, template purposes and variable allowlists, verification codes and limits, setup gaps and readiness gates, audit, and authorization.

## What an adapter does

- **Payment.** Create a hosted checkout for the exact amount (minor units, currency) carrying Rivana's payment id as the merchant reference; verify an incoming webhook from the raw body, headers, and query (signature scheme is the adapter's business) and return a normalized event (`SUCCEEDED`, `FAILED`, `REFUNDED`, `REFUND_FAILED`) with the provider transaction id, amount, and currency, or a rejection; look a transaction up; request a full refund. It never confirms a booking, writes the database, or logs a payload.
- **WhatsApp.** Send a template message (name, language, ordered variables) to an E.164 number and return the provider message id or a mapped failure code (`RATE_LIMITED`, `UNAVAILABLE`, `TEMPLATE_MISSING`, rejected, and so on).
- **Email.** Send a rendered message to an address and return success or a mapped failure code. Rendering stays in Rivana.

A provider must offer at least: for payment, a hosted checkout (no card fields on Rivana pages), a server to server result Rivana can verify, and a refund API; for WhatsApp, template messages; for email, authenticated sending. A provider without one of these is a new decision (ADR 030 consequences).

## Contract tests

Each port has one shared suite that every adapter must pass. `npm run test` runs the [WhatsApp transport](../../tests/contract/whatsapp-transport.test.ts) and [reservation email](../../tests/contract/reservation-email.test.ts) suites against both fakes and the existing Meta and SMTP adapters with stubbed provider responses. The suites cover successful delivery, mapped failures, and confidentiality in logs and failure results. The fake email adapter keeps the latest 100 successful deliveries in process memory. The planned payment suite covers unsigned and altered callbacks, repeat events, exact amounts and currencies, idempotent refunds, checkout expiry, and confidential logs and errors.

## Environment variables

| Variable | Meaning | Rule |
| --- | --- | --- |
| `PAYMENT_PROVIDER` | Payment adapter name | Defaults to `fake` in development and test. Unset in production. Adapter registration is planned in M9-T3 |
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
