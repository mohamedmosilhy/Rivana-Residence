# ADR 019 — Verified phone profiles for guests, without accounts

Status: **Accepted** (2026-10-24). **Amended by [ADR 024](./024-immediate-confirmation.md) and [ADR 028](./028-whatsapp-guest-messaging.md) (2026-11-06):** guests no longer cancel `PENDING` requests (that status is removed); they submit cancellation requests until 24 hours before check-in, which a Manager or Admin approves. WhatsApp also carries feedback requests and consented marketing broadcasts. Phone verification, profiles, blocking, and guest access below are unchanged. The business choices were decided by the project owner on 2026-10-24: verified phone profiles instead of accounts (Q-27), codes by WhatsApp only (Q-28), Admin and Manager may block numbers (Q-29), and guests cancel only pending requests online (Q-07).

## Context

The scope PDF (sections 5–6) mentions WhatsApp verification and customer accounts. The client wants to stop fake reservations and to block phone numbers that abuse online booking. Guests also need to see their reservations without a password, and a reservation reference alone is not a secret.

## Problem

How do we know an online booking comes from a reachable person, let staff block abusers, and give guests access to their bookings, without the scope of full customer accounts?

## Options considered

1. **Unverified guest details** (name, email, phone typed in). Blocking is impossible because anyone can type any number. Fake bookings hold inventory. Rejected.
2. **Full customer accounts** (sign-up, sign-in with phone and code, profile pages, persistent sessions). Solves verification, but adds account management, session security, profile screens, and account recovery. Not needed yet.
3. **Verified phone profiles.** Each online booking proves possession of a phone number with a one-time code sent by WhatsApp. Rivana keeps one guest profile per verified number, which staff can see and Admin or Manager can block. Guests reach their bookings with phone and code, or with the link sent to them. There are no passwords and no profile pages.

## Decision

Option 3.

**Phone verification**

- The booking form asks for the phone number in international format (E.164; for example `+201001234567`). Rivana sends a 6-digit code by WhatsApp through the `WhatsAppSender` port, using an approved authentication template.
- The code is valid for 10 minutes and allows 5 attempts. Only its hash is stored (`PhoneVerification`). Limits: 3 codes per number per 15 minutes, 10 per number per day, and per-client limits on top.
- A correct code returns a **verification token** that is valid for 30 minutes and for one reservation. `POST /api/v1/reservations` requires it, and the reservation's phone is the verified one.
- A blocked number gets no code. The guest sees a neutral message asking them to contact the hotel.
- Staff-created and external reservations need no code, because staff took the details themselves. They are linked to the guest profile with the same number if one exists; otherwise a profile is created marked **unverified**.

**Guest profile** (`Guest`, one per normalized phone number)

- It holds the phone, the latest name and email used, `phoneVerifiedAt`, and block status (`blockedAt`, `blockedById`, `blockReason`). Reservations reference it.
- Staff with `guests:read` see the profile with its reservation history, limited to reservations in the branches they can access.
- Admin and Manager (`guests:block`) block or unblock a number with a reason, for all branches. Each action is audited. Existing reservations are not changed automatically; staff decide case by case.
- Data is kept indefinitely (Q-13).

**Guest access to reservations**

- **Link:** the request-received and confirmation messages, by email and WhatsApp, contain a manage link `/reservations/manage#t=<token>`. The token is 256-bit random and stored only as a SHA-256 hash. It sits in the URL fragment, so it never reaches server logs or `Referer`. It expires 30 days after check-out, and staff can rotate it.
- **Phone + code ("My reservations"):** a guest enters their phone, receives a code by WhatsApp, and gets a guest session token valid for 30 minutes. With it they can list and view the reservations of that verified number.
- Guest actions: view, and cancel a `PENDING` request. A `CONFIRMED` reservation shows the hotel's contact details for cancellation (Q-07).

**Notifications:** guest messages go by email and WhatsApp (Q-32), queued in the outbox per channel. Email remains required on online bookings.

## Rationale

Verification makes blocking meaningful and raises the cost of fake bookings, because each request needs a real WhatsApp number. One profile per number gives staff history without building accounts. Phone and code gives guests passwordless access. The `Guest` table is the natural place to attach real accounts later.

## Consequences

- The booking journey gains a verification step, and online booking depends on a working WhatsApp Business sender (Q-10). Without it, a branch's online booking must stay off.
- Guests without WhatsApp cannot book online (known limitation L-13).
- New tables `Guest` and `PhoneVerification`, `Reservation.guestId`, a per-channel outbox, and new endpoints ([../api/api-contracts.md](../api/api-contracts.md)).
- Phone numbers are normalized with a maintained library (`libphonenumber-js`, a new dependency to confirm in M7). Phone formats are not parsed by hand.

## Risks

- Cost and abuse of verification messages (OTP pumping). Mitigation: per-number, per-client, and daily limits; honeypot; WhatsApp's authentication templates are less exposed to SMS toll fraud.
- Meta approval delays for the business number and templates. Mitigation: start the setup during M4–M6 (Q-10).
- A shared phone (a family member) can see that number's bookings. That is acceptable, since possession of the phone is the identity.
