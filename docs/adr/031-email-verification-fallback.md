# ADR 031 — Verification by email as a fallback to WhatsApp

Status: **Accepted** (2026-11-22, owner decision, Q-93). Extends [ADR 019](./019-guest-reservation-access.md) and [ADR 028](./028-whatsapp-guest-messaging.md); amends Q-71 (what makes online booking possible). Built in M9-T12; the booking form support is in M10.

**As built (M9-T12a, 2026-11-25; spec 0006 Decision 9).** Owner decisions refined this ADR: the existing `Guest.phoneVerifiedAt` stays the phone verified fact (no separate `phoneVerified` column); `Reservation.verificationChannel` records what each website booking proved; `Reservation.verifiedEmail` stores the lowercased email an email code proved (set at booking only, never changed by contact edits, enforced by a CHECK), and the per email cap counts by it; an email booking never records marketing consent and never overwrites the name or email of an existing guest profile (WhatsApp verified or not, owner decision 2026-11-26); a WhatsApp session does not show bookings verified by email; an email booking's guest messages, including any manage link, go by email only; the per email cap is 2 upcoming pay at hotel bookings and 1 open hold; and an Admin switch (Q-99, API-A9, off by default) must be on for email codes to be offered. The guest session by email and the staff fields follow in M9-T12b.

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
- **Availability and the gate.** Online booking for a branch needs at least one verification channel ready: WhatsApp (Q-71) or email (the email adapter configured). P9 with a channel that is not ready returns `503` (`WHATSAPP_NOT_CONFIGURED` or `EMAIL_NOT_CONFIGURED`); the booking form offers only ready channels, and offers email when a WhatsApp code could not be sent or is not wanted. `BRANCH_NOT_BOOKABLE` gains the reason "no verification channel configured".
- **Staff and privacy.** The guest profile and reservation detail show "phone not verified, email verified" so staff confirm the phone on arrival. Notices name the email provider the same way as the WhatsApp provider (Q-30). Email codes use a dedicated template and never contain a manage link.

## Rationale

A guest who cannot receive WhatsApp can still book, and the system stays honest about what was proven. Keeping the phone as the identity avoids rewriting caps, blocking, and sessions. Skipping per phone coupon limits for unverified phones follows the rule already accepted for P6 and P7.

## Consequences

- New columns on `PhoneVerification` (`channel`, `email`) and on `Guest` (`phoneVerified`, with `emailVerifiedAt`) in an additive migration (M9-T12).
- Email is easier to create than a phone number, so abuse limits are weaker for this channel. Pay at hotel needs no money up front, the hotel confirms details on arrival, and the limits above apply. The owner accepts this trade off.
- Q-71 and the branch switch refusal text change; the M12 branch screen shows both channels in its readiness reasons.

## Risks

- Email bombing of a victim's address through P9. Mitigation: per email limits, per client limits, identical responses, and a short generic email.
- Rotating claimed phones to dodge the per phone cap. Mitigation: per email cap, the booking bucket, and staff visibility of unverified phones.
- A lost email adapter at launch leaves only WhatsApp (and the reverse). Mitigation: the gate checks readiness per channel, and the setup gap list shows what is missing.
