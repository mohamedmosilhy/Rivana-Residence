# ADR 031 — Verification by email as a fallback to WhatsApp

Status: **Accepted** (2026-11-22, owner decision, Q-93). Extends [ADR 019](./019-guest-reservation-access.md) and [ADR 028](./028-whatsapp-guest-messaging.md); amends Q-71 (what makes online booking possible). Built in M9-T12; the booking form support is in M10.

**As built (M9-T12a, 2026-11-25; spec 0006 Decision 9).** Owner decisions refined this ADR: the existing `Guest.phoneVerifiedAt` stays the phone verified fact (no separate `phoneVerified` column); `Reservation.verificationChannel` records what each website booking proved; `Reservation.verifiedEmail` stores the lowercased email an email code proved (set at booking only, never changed by contact edits, enforced by a CHECK), and the per email cap counts by it; an email booking never records marketing consent and never overwrites the name or email of an existing guest profile (WhatsApp verified or not, owner decision 2026-11-26); a WhatsApp session does not show bookings verified by email; an email booking's guest messages, including any manage link, go by email only; the initial per email cap was 2 upcoming pay at hotel bookings and 1 open hold, narrowed to 1 open hold by Q-100; and an Admin switch (Q-99, API-A9, off by default) must be on for email codes to be offered. **M9-T12b (2026-11-26):** a guest session by email lists and opens every booking whose current contact email is the proven email, whatever verified it, and never matches by phone; the typed phone is still required at P9 for limits and the block check; writes through the session recheck the email under the reservation lock; staff see `verificationChannel`, `verifiedEmail`, and `emailVerifiedAt`.

## Context

A booking needs a verified contact before the guest can submit (M8-T5, GV-1…6). The code is sent by WhatsApp, so a branch cannot take online bookings until a WhatsApp provider, number, token, and approved templates exist, and a guest whose WhatsApp message does not arrive cannot book. The provider choice is open until launch (ADR 030). The owner wants a second channel, email, so booking does not depend on one provider.

## Problem

Email proves that the guest controls an address, not a phone number. Rivana's rules (per phone caps, blocked phones, per phone coupon limits, the guest session) are keyed on a verified phone. How do we offer email verification without weakening those rules or pretending an unverified phone is verified?

## Options considered

1. **Send the same code by email and treat the phone as verified.** Wrong: the guest never proved the phone, so every phone based rule becomes a claim.
2. **Replace the phone with the email as the identity.** A large change to guests, caps, blocking, and sessions.
3. **Add an email channel that verifies the email, keeps the phone as a claimed (unverified) contact, and says so everywhere.**

## Decision

Option 3.

- **Channel.** `POST /api/v1/phone-verifications` (P9) accepts an optional `channel`: `WHATSAPP` (default, unchanged) or `EMAIL`. With `EMAIL` the body also carries `email`; the code is sent to that address by the email adapter. P10 is unchanged; the response and token are the same shape. The code is bound to the verification id, the phone, the email, the purpose, and the channel (HMAC), so a code for one channel never confirms another.
- **What the token proves.** A token from the email channel records `verifiedChannel = EMAIL` and the verified email. P7 requires the booking's `guest.email` to equal it (normalized). The phone in the booking is stored as given and the guest profile marks it `phoneVerified = false`. A WhatsApp token marks it `true`, as today.
- **Rules that still apply to the claimed phone.** Blocked phones are refused (a staff block also invalidates open email verifications for that phone). The per phone booking cap (Q-60) counts bookings by phone whether or not it was verified. The client rate limits and the `booking-create` bucket apply unchanged.
- **Rules that need a verified phone.** The per phone coupon limit is enforced only for a WhatsApp verified phone (the M7 and M8 rule, Q-60 follow up): an email verified booking is not refused for it, and no response reveals which phone used a coupon. A guest session (G3) from the email channel lists only reservations whose guest email equals the verified email; it never matches by phone. The manage link is unchanged.
- **Email specific limits.** GV-1 applies per email as it does per phone (3 per rolling 15 minutes, 10 per rolling 24 hours, 10 minute expiry, 5 attempts), and the per client limits apply to both channels together. Responses stay identical whether or not the email or phone has history. A bounded cap on upcoming bookings per verified email (default 2, owner to confirm) limits abuse by rotating claimed phones.
- **Availability and the gate.** A branch needs ready WhatsApp (Q-71) or ready email with online payment available (Q-100). P9 returns `503 WHATSAPP_NOT_CONFIGURED` or `503 EMAIL_NOT_CONFIGURED` when the requested channel cannot issue a code. The booking form will offer email for online payment only. P7 reports `VERIFICATION_NOT_CONFIGURED` when it has no usable channel. A valid email booking token can still finish online after new email codes are turned off if the branch can take online payment.
- **Staff and privacy.** The guest profile and reservation detail show "phone not verified, email verified" so staff confirm the phone on arrival. Notices name the email provider the same way as the WhatsApp provider (Q-30). Email codes use a dedicated template and never contain a manage link.

## Rationale

A guest who cannot receive WhatsApp can still book, and the system stays honest about what was proven. Keeping the phone as the identity avoids rewriting caps, blocking, and sessions. Skipping per phone coupon limits for unverified phones follows the rule already accepted for P6 and P7.

**Amended (Q-100, owner 2026-11-26, implemented M9-T12c).** A booking verified by email must be paid online. Pay at hotel needs a WhatsApp code. P7 refuses the combination with `409 ONLINE_PAYMENT_REQUIRED` and preserves the token for online checkout. The branch readiness rule counts email when email codes are available and the branch can take online payment. An already issued email code can be confirmed and its valid booking token can finish online after email issuance is switched off, provided the branch allows online booking and online payment is available.

## Consequences

- New columns on `PhoneVerification` (`channel`, `email`) and on `Guest` (`phoneVerified`, with `emailVerifiedAt`) in an additive migration (M9-T12).
- Email addresses are easier to create than phone numbers. Q-100 limits unpaid inventory use to a 15 minute hold. The limits above apply, and staff confirm the typed phone on arrival.
- A9 requires configured email delivery and a payment gateway before turning email codes on. An email booking can use one open payment hold per verified email. PostgreSQL checks the payment method on every new or updated email verified booking. The M12 branch screen will show both verification channels in its readiness reasons.

## Risks

- Email bombing of a victim's address through P9. Mitigation: per email limits, per client limits, identical responses, and a short generic email.
- Rotating claimed phones to dodge the per phone cap. Mitigation: per email cap, the booking bucket, and staff visibility of unverified phones.
- A guest session by email trusts the booking's current contact email, which a WhatsApp booker or staff typed without proving it (M9-T12b, owner decision 2026-11-26). Whoever controls that mailbox can open the booking and request a cancellation or change. Mitigation: that mailbox already receives the booking's confirmation and manage link, so the session grants nothing the mailbox lacks; writes recheck the email under the reservation lock; staff can correct the email, which ends the access at once (L-21).
- A lost email adapter at launch leaves only WhatsApp (and the reverse). Mitigation: the gate checks readiness per channel, and the setup gap list shows what is missing.
