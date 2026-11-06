# M13 — WhatsApp marketing broadcasts and feedback requests

Status: **Not started.** Branch: `m13-whatsapp-marketing`. Follow the [milestone loop](./README.md#the-loop-every-milestone-follows).

## Objective

Rivana sends consented marketing broadcasts (offers and coupon codes) by WhatsApp, and a feedback request after staff record check-out. Guests reply in the WhatsApp chat; Rivana stores no replies.

## Read first

- ADR [028](../../adr/028-whatsapp-guest-messaging.md), ADR [019](../../adr/019-guest-reservation-access.md)
- [requirements/functional-requirements.md](../../requirements/functional-requirements.md) (FR-MKT)
- [security/threat-model.md](../../security/threat-model.md) (marketing consent)
- [api/api-contracts.md](../../api/api-contracts.md) (S54, S60–S62)
- The chosen WhatsApp provider's documentation for marketing templates, opt-out, and rate limits

## Blocking questions (must be answered before starting)

- Q-67 (decided): the Admin enters the marketing and feedback templates (approved in Meta by the client) in the template manager built in M8; nothing in this milestone hard-codes template names.
- Q-58 ★ consent wording, opt-out, audience filters, frequency limit.
- Q-59 feedback delay, text, category.

## Skills for this milestone

| Step | Skill | Notes |
| --- | --- | --- |
| Spec | `/architect` (`FEATURE`) | Audience query, frequency rule, opt-out intake |
| Build | `/develop` (logic track; UI track for `/admin/broadcasts`) | |
| Tests | `/test` | Audience query edge cases are the core of this milestone |
| Failures | `/debug` | |
| Proof | `/check verify` | Send a broadcast with the fake adapter to a seeded audience; check exclusions |
| Review | `/check review` | Focus: consent, blocked numbers, rate limiting, audit |
| After merge | `/sync` | |

## In scope

Feedback message on check-out, opt-out recording, broadcasts model and sending, admin screen, audit.

## Out of scope (binding)

Storing guest replies or ratings; SMS; email marketing; automated campaigns or segments beyond branch and consent.

## Tasks

1. Use the `MARKETING` and `FEEDBACK_REQUEST` template purposes from the M8 template manager; the composer lists active marketing templates and their variables.
2. `CheckOut` transaction (M8) queues one feedback outbox row per reservation with `availableAt = checkOut time + delay` (Q-59); none for no-shows or cancellations.
3. Opt-out: provider inbound webhook (if the provider offers it) maps STOP replies to `marketingOptOutAt`; staff can record an opt-out on the guest profile; both audited.
4. Migration `marketing`: `Broadcast` (author, branch scope, template id, variables, coupon id optional, audience count, status, timestamps).
5. `PreviewBroadcastAudience` and `SendBroadcast` (`marketing:broadcast`, branch-scoped): audience = guests with a reservation at the chosen branches who opted in, have not opted out, are not blocked, and have not received a broadcast within the frequency window; one outbox row per recipient; sending rate-limited.
6. `/admin/broadcasts`: list, compose (template, variables, optional coupon), preview count, confirm, status.
7. API-S60–S62, and API-S54 (staff records an opt-out).

## Acceptance criteria

1. The audience excludes guests without opt-in, with an opt-out, blocked, outside the chosen branches, or inside the frequency window (tests for each).
2. Managers can broadcast only to their branches; every broadcast is audited with author, audience size, and template.
3. A feedback message is queued once per checked-out reservation and never before check-out is recorded.
4. Opt-out takes effect for the next broadcast immediately.

## Tests

T-MKT-1…6, E2E-M-5.

## Evidence for the report

Audience query test table; a broadcast run with the fake adapter; provider sandbox evidence if available.

## Risks

- Consent mistakes; Meta template rejection or pauses.

## Handoff

Report, then stop. M14 has not started.
