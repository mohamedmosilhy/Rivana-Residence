# ADR 030 — Provider neutral integrations: payment, WhatsApp, and email behind ports, plugged in at launch

Status: **Accepted** (2026-11-22, owner decision, Q-92). Supersedes the Paymob specific parts of [ADR 025](./025-paymob-online-payment.md) (its flow, holds, refunds, and state rules stay) and amends [ADR 028](./028-whatsapp-guest-messaging.md) (the provider stays open) and the "keys arrive when M9 starts" rule (Q-55).

## Context

Three external providers are still undecided: the online payment gateway, the WhatsApp provider (Meta Cloud API directly or another), and the email provider. The client will choose each one when the site is deployed, based on what each charges. M8 already put WhatsApp and email behind ports with fake or stand in adapters. M9 to M15 were still written around Paymob: a Paymob only adapter, a Paymob callback route, a `PAYMOB` payment method, and a rule that M9 cannot start until the Paymob sandbox keys arrive.

## Problem

How do we build every feature that depends on these providers now, finish and prove it without any provider account, and make "choose a provider at the end" a small, safe step?

## Options considered

1. **Build against the likely provider (Paymob, Meta, SMTP) and swap later.** Provider shapes leak into the schema, routes, and tests; swapping becomes a rewrite and the milestones wait for keys.
2. **A generic provider abstraction with many provider options built in advance.** Large, and each provider's real behavior is unknown until it is chosen.
3. **Own the logic, define small ports and contract tests, ship fake adapters, and write only the chosen providers' adapters at the end.**

## Decision

Option 3.

**What Rivana owns (built and proven in M9 to M14 with fake adapters).** Everything that does not depend on which company is chosen: reservation states and holds (ADR 025 flow), idempotency, amount and currency checks, duplicate and late callback handling, hold expiry, reconciliation, the refund state machine and retry, the outbox with retries and scrubbing, templates and message purposes, verification codes and limits, setup gaps and readiness gates, audit, authorization, and every screen.

**What an adapter owns (written at launch, one file per provider).** Translating the port's calls into one provider's API and one provider's webhook format: request signing, the checkout or order creation call, webhook signature verification, refund calls, error code mapping.

**Ports (one per kind).**

- `PaymentGateway`: `createCheckout`, `verifyCallback(rawBody, headers, query)`, `getTransaction`, `refund`. The adapter does its own signature check (HMAC or otherwise); the route only passes the raw request through.
- `WhatsAppTransport` (exists, M8-T4): `deliver`.
- `ReservationEmailSender` (exists, M8-T6): `send`.

**Selection by deployment, not by dashboard.** `PAYMENT_PROVIDER`, `WHATSAPP_PROVIDER` (exists), and `EMAIL_PROVIDER` choose the adapter in `src/composition` from a small registry. `fake` is the default outside production and is refused in production (the existing WhatsApp rule, applied to all three). Provider secrets are server only environment variables, never stored in the database or the dashboard. A provider that is not configured means the matching feature is off and shown as a setup gap; it never means an error at runtime or a build failure.

**Neutral names in contracts and data.** The payment method is `ONLINE` (not `PAYMOB`); `Payment.provider` is an adapter name stored as text; the one webhook route is `POST /api/v1/payments/callback`; error and message texts say "online payment", never a provider name. Guest facing screens may show the chosen provider's name only if the client asks.

**Fake adapters are the reference implementations.** The fake payment gateway includes a simulated hosted checkout page (development and test only, refused in production) so success, failure, abandonment, a late success, a lost callback, and a refund can be run end to end in a browser and in tests. The fake email adapter records messages like the fake WhatsApp transport.

**Contract tests.** One shared test suite per port states what every adapter must do (for the gateway: reject an unsigned or altered callback, return the same event for a repeated callback, report amount and currency, make refunds idempotent, never log card or secret data). The fake adapter passes it in M9; each real adapter must pass the same suite before launch. This turns "plug in a provider" into: write the adapter, run the suite, run the provider's sandbox, set the environment variables.

**One guide.** [architecture/provider-adapters.md](../architecture/provider-adapters.md) lists the ports, the contract tests, the environment variables, and the steps to add an adapter.

## Rationale

The risky and valuable parts (money state, idempotency, holds, retries, consent, gates) are the same for every provider. Proving them once against a faithful fake removes the dependency on accounts, keys, approvals, and fees, and keeps the client's choice a launch decision. Contract tests keep adapters honest without a provider account during development.

## Consequences

- M9 no longer waits for keys. Its sandbox run moves to M15 (per chosen provider); M14 runs the full payment scenarios on the fake gateway.
- M9-T1 renames the `PaymentMethod` value `PAYMOB` to `ONLINE`. M8 accepted only `PAY_AT_HOTEL`, so no row holds `PAYMOB`; the public P7 contract changes in the same commit (a documented, unused value).
- Production cannot take online payments, WhatsApp messages, or email until the real adapters are plugged in (M15-T4). Pay at hotel bookings need a verification channel and an email or WhatsApp sender to be useful, so they also wait for those adapters in production.
- A provider with unusual behavior (redirect only results, no webhook, no refund API) may need a small port extension at launch. The ADR 025 flow assumes a hosted checkout with a server to server result and a refund API; a gateway without them is a new decision, not an adapter.

## Risks

- The fake hides a real provider quirk (amount in different units, webhook ordering, refund delays). Mitigation: the contract suite lists the behaviors found in M9 research of common gateways; M15 runs the chosen provider's sandbox before launch; adapters are small and isolated.
- A required port capability is missing for the chosen provider. Mitigation: the guide lists the minimum a provider must offer; the client is told before choosing.
- A fake adapter reaches production. Mitigation: environment validation refuses `fake` in production for all three kinds, with a test.
