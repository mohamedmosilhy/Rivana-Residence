# Provider adapters: payment, WhatsApp, email

Status: **Partly implemented.** The WhatsApp and email ports and the `fake` WhatsApp adapter exist (M8). The payment port and fake gateway, the fake email adapter, `EMAIL_PROVIDER`, and the shared contract tests are planned (M9-T0b, M9-T3). Decision: [ADR 030](../adr/030-provider-neutral-integrations.md). The real adapters are written at launch (M15-T4) once the client has chosen each provider.

The rule: **Rivana owns the logic; an adapter only translates.** If a change to a provider would touch a use case, a Route Handler, or a table, the port is wrong, not the adapter.

## The three ports

| Kind | Port (module) | Calls | Selected by | Fake adapter | Real adapter lives in |
| --- | --- | --- | --- | --- | --- |
| Online payment | `PaymentGateway` (`src/application/payments`) | `createCheckout`, `verifyCallback`, `getTransaction`, `refund` | `PAYMENT_PROVIDER` | Planned (M9-T3), with a simulated checkout page | `src/infrastructure/payments/<provider>/` |
| WhatsApp | `WhatsAppTransport` (`src/application/notifications`) | `deliver` | `WHATSAPP_PROVIDER` (`meta`, `fake`) | Implemented (M8-T4) | `src/infrastructure/whatsapp/` |
| Email | `ReservationEmailSender` (`src/application/notifications`) | `send` | `EMAIL_PROVIDER` (`smtp`, `fake`) | Planned (M9-T0b) | `src/infrastructure/email/` |

Adapters are constructed only in `src/composition` from the environment (dependency rule: infrastructure is built only there). A kind with no configured real adapter is off: the feature shows as a setup gap and never throws at runtime.

## What stays in Rivana (never in an adapter)

Reservation and payment state, holds and expiry, amount and currency checks, idempotency and duplicate handling, late success handling, reconciliation, refund state and retry, the outbox with retries and scrubbing, template purposes and variable allowlists, verification codes and limits, setup gaps and readiness gates, audit, and authorization.

## What an adapter does

- **Payment.** Create a hosted checkout for the exact amount (minor units, currency) carrying Rivana's payment id as the merchant reference; verify an incoming webhook from the raw body, headers, and query (signature scheme is the adapter's business) and return a normalized event (`SUCCEEDED`, `FAILED`, `REFUNDED`, `REFUND_FAILED`) with the provider transaction id, amount, and currency, or a rejection; look a transaction up; request a full refund. It never confirms a booking, writes the database, or logs a payload.
- **WhatsApp.** Send a template message (name, language, ordered variables) to an E.164 number and return the provider message id or a mapped failure code (`RATE_LIMITED`, `UNAVAILABLE`, `TEMPLATE_MISSING`, rejected, and so on).
- **Email.** Send a rendered message to an address and return success or a mapped failure code. Rendering stays in Rivana.

A provider must offer at least: for payment, a hosted checkout (no card fields on Rivana pages), a server to server result Rivana can verify, and a refund API; for WhatsApp, template messages; for email, authenticated sending. A provider without one of these is a new decision (ADR 030 consequences).

## Contract tests

Each port has one shared suite that every adapter, fake or real, must pass. The real adapters run it against recorded or sandbox responses. Minimum payment cases: an unsigned or altered callback is rejected; a repeated verified callback returns the same event; amount and currency are reported exactly; a refund request is idempotent per payment; an expired checkout is reported; no secret, card number, or full payload appears in any log line or thrown error. WhatsApp and email suites cover the failure code mapping and that no recipient or content appears in logs.

## Environment variables

| Variable | Meaning | Rule |
| --- | --- | --- |
| `PAYMENT_PROVIDER` | Payment adapter name | `fake` is the default outside production and refused in production; unset in production means online payment is off |
| `WHATSAPP_PROVIDER` | WhatsApp adapter name (`meta`, `fake`) | Implemented (M8-T4); same `fake` rule |
| `EMAIL_PROVIDER` | Email adapter name (`smtp`, `fake`) | Planned (M9-T0b); same `fake` rule |
| Provider secrets (for example an API key, webhook secret, access token) | Read only by that provider's adapter | Server only, never in the dashboard or database; the client bundle check covers them |

## Adding a real provider (launch, M15-T4)

1. Read the provider's current documentation and note the API version and fields used in the milestone report.
2. Write the adapter file in `src/infrastructure/<kind>/<provider>/` and register its name in the composition registry.
3. Run the kind's contract suite against it; add provider specific tests for its error mapping and webhook format.
4. Set the environment variables on the server (`.env.local` locally), register the callback URL for a payment gateway, and run the Admin test message for WhatsApp and email.
5. Run the provider's sandbox: for payment, pay, fail, abandon, late success, and refund; then one live low value payment and refund before launch.
6. Record the result in the launch evidence, and add the provider's name to the privacy notice where it receives guest data (Q-30).
