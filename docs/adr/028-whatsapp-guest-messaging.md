# ADR 028 — WhatsApp guest messaging: confirmations, feedback requests, and consented marketing broadcasts

Status: **Accepted** (2026-11-06, client decisions Q-50, Q-51, Q-53, Q-67). The provider choice remains open (Q-10; Meta Cloud API recommended), as do consent wording and broadcast rules (Q-58) and feedback timing (Q-59). Extends [ADR 019](./019-guest-reservation-access.md), which limited WhatsApp to verification codes and booking messages.

## Context

Rivana already plans WhatsApp for verification codes and booking messages through a `WhatsAppSender` port and a per-channel outbox. The client now wants a confirmation message that reflects the confirmed status, a feedback request after the guest leaves, and offers and promo codes sent through WhatsApp. Marketing messages need the guest's consent, an opt-out, and Meta marketing templates; the PMS is not integrated, so Rivana does not know when a guest really leaves.

## Decision

- **Configuration in the dashboard (Q-67).** An Admin-only WhatsApp settings screen holds the business phone number (an empty placeholder until the client supplies it) and the provider's phone-number id, shows whether the server-side access token is configured, and has **Send test message**: the Admin enters a phone number, Rivana sends the template chosen for tests, and the screen shows the provider's success or error. While the number is empty, WhatsApp sending is off and online booking cannot be enabled (verification codes need it). The access token is a server secret, never entered in the browser or stored in the database.
- **Templates managed by the Admin (Q-67).** `WhatsAppTemplate` rows, one per message purpose and language: purpose (verification code, booking confirmed, payment not completed, cancellation request received, approved, rejected, refund completed, cancelled by the hotel, manage link, feedback request, marketing, test), the template name exactly as approved in Meta, language code, category, an ordered mapping of template variables to allowlisted booking fields (guest first name, reference, branch, dates, total, manage link, code, …), a preview text, and an active switch. Rivana sends by template name and mapped variables; it does not submit templates to Meta. The client creates and approves the same templates in Meta's tools and enters the approved names. A purpose with no active template is not sent and is shown as a setup gap. Arabic is added by creating templates in that language.
- **Message classes.** Every WhatsApp message belongs to one class: *authentication* (verification codes), *transactional* (confirmation, cancellation request received, cancellation approved or rejected, refund, manage link), *feedback* (after check-out), or *marketing* (broadcasts). Each class maps to its own approved template set in the adapter.
- **Confirmation.** Written to the outbox in the transaction that makes the reservation `CONFIRMED` (ADR 024), so it is sent only after commit and always says "confirmed". Sent for every confirmed website reservation, and for staff bookings when staff choose to notify.
- **Feedback.** When staff record check-out in Rivana, the check-out transaction queues one feedback message per reservation, available after a delay (Q-59). Guests reply in the WhatsApp chat; staff read replies in the WhatsApp Business inbox. Rivana does not receive or store replies. Rivana never claims to know the departure time from the PMS.
- **Marketing consent.** The booking form has an unticked opt-in checkbox for offers by WhatsApp. The guest profile stores `marketingOptInAt`, the consent wording version, and `marketingOptOutAt`. Opt-out (a STOP reply forwarded by the provider webhook if available, or recorded by staff) takes effect immediately. Blocked numbers never receive broadcasts.
- **Broadcasts.** An Admin, or a Manager for their branches, composes a broadcast from an approved marketing template, optionally attaches a coupon code (ADR 027), selects an audience (guests of chosen branches who are opted in, not opted out, and not blocked), previews the recipient count, and sends. Each recipient becomes an outbox row; sending is rate-limited and retried like other messages. Every broadcast is audited with its author, audience, template, and count.
- Delivery failures never roll back reservations, and payloads never contain secrets other than the manage link, which is scrubbed after sending (existing rule).

## Rationale

Keeping every message in the outbox gives one retry and audit path. Separating classes keeps transactional messages flowing even when marketing is paused or templates are rejected.

## Consequences

- New tables `WhatsAppSettings`, `WhatsAppTemplate`, `Broadcast`, and per-recipient outbox rows; consent columns on `Guest`.
- The privacy notice and consent wording must name the WhatsApp provider and explain marketing messages (Q-30, Q-58).
- Templates cost money per message and need Meta approval; the client owns that setup and keeps the names entered in Rivana in step with Meta.

## Risks

- An entered template name or variable order does not match what Meta approved, so sends fail. Mitigation: the test message, provider errors shown on the settings screen and on reservation detail, and outbox retries.
- Sending marketing without valid consent. Mitigation: the audience query requires opt-in and excludes opt-outs and blocked numbers, with tests.
- Meta rejects or pauses marketing templates. Mitigation: broadcasts are independent of booking; transactional messages use separate templates.
