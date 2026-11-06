# Threat model, authorization, and data protection

The threats to Rivana and the controls against them. Implemented controls for authentication, uploads, content, the contact form, headers, and secrets are specified in [security-controls.md](./security-controls.md). This document covers the full threat model, with the reservation features (status: **Planned**, design accepted 2026-10-24, revised 2026-11-06 for immediate confirmation, Paymob payments and refunds, coupons, VAT, and WhatsApp marketing; built in M4–M14) in most detail, because they add guest personal data, money, and consent.

## Assets

- Website and content: published content integrity, the media store and upload pipeline, contact enquiries (visitor personal data), and the promotion popup. Their implemented controls are in [security-controls.md](./security-controls.md).
- Staff accounts, sessions, roles, and branch assignments.
- Reservations: guest personal data (name, email, phone, country, requests, stay dates); reservation integrity (status, prices, VAT, discounts, inventory); manage tokens; the audit trail; availability, which competitors or bots might scrape.
- Money: payment state, refunds, Paymob credentials and HMAC secret, coupon codes and their limits.
- Consent: marketing opt-in and opt-out records; the right not to receive unwanted WhatsApp offers.

## Trust boundaries

1. Browser to `/api/v1` public endpoints (anonymous, hostile input).
2. Browser with manage token to `/api/v1/guest/*`.
3. Staff browser (session cookie) to `/api/v1/staff/*` and `/admin`.
4. Application to PostgreSQL (runtime role), to SMTP, to the WhatsApp provider, and to Paymob (outbound API calls).
4a. Paymob to `/api/v1/payments/paymob/callback` (unauthenticated except for the HMAC).
5. Staff to the PMS (outside the system, by people).

## STRIDE analysis

| Threat | Example | Controls |
| --- | --- | --- |
| **Spoofing** staff | Stolen cookie, credential stuffing | Existing: HttpOnly, Secure, SameSite=Lax cookies, DB sessions, revocation, throttled generic login. Recommend TOTP for Admin and Manager before go-live (Better Auth plugin, not custom) |
| Spoofing guest | Guessing a reference; booking with someone else's phone | Reference alone grants nothing; 256-bit manage token; every online booking and every "My reservations" session needs a WhatsApp code sent to the phone (ADR 019) |
| Fake reservations | Bookings with invented or throwaway numbers | Mandatory WhatsApp verification; one guest profile per number; Manager or Admin blocks abusive numbers for all branches (Q-29); staff cancel |
| Code brute force or interception | Guessing the 6-digit code | 10-minute expiry, 5 attempts, codes hashed at rest, constant-time compare, per-number and per-client limits |
| Message pumping | Bots requesting many codes to run up messaging costs | 3 codes per number per 15 minutes, 10 per day, per-client limits, honeypot; alert on unusual volume; WhatsApp authentication templates are less exposed to SMS toll fraud |
| **Tampering** price | Client sends a lower total, discount, or VAT | Server recomputes the whole quote; `expectedTotal` only detects drift (PR-7); price, discount, and tax fields not accepted on public create (`.strict()`) |
| Forged payment result | Attacker calls the callback or edits the return URL to mark a booking paid | HMAC verification with a server-only secret; amount and currency must match the `Payment`; browser return is display only (PY-3); unknown payments ignored |
| Replayed payment result | Same signed callback sent again | Unique provider event id; transitions only from `AWAITING_PAYMENT` (PY-4) |
| Refund abuse | Receptionist or attacker triggers refunds | Refunds only through `cancellations:decide` or `reservations:cancel-paid` (Manager, Admin), branch-scoped, audited; second sign-in step recommended (Q-33) |
| Coupon abuse | Guessing codes; exceeding limits by racing; using a branch-limited code elsewhere | Rate limits on quote attempts; case-insensitive lookup with uniform refusal reasons; coupon row lock in the booking transaction (CP-3); branch and per-phone checks on the server |
| Inventory squatting with holds | Bots open many payment holds | Verified phone required before submit; one open hold per phone (Q-60); 15-minute expiry; per-client rate limits |
| Tampering branch | Client posts `branchId` of another branch, or a room of another branch | Slugs resolved server-side; composite FKs; `authorizeBranch` |
| Mass assignment | Extra JSON fields like `status: "CONFIRMED"` | `.strict()` Zod DTOs; commands built field by field |
| CSRF on staff REST | A malicious site posts with the staff cookie | `Origin` and `Sec-Fetch-Site` check, JSON-only content type, no CORS, SameSite=Lax |
| **Repudiation** | "I didn't cancel that" | Append-only `AuditEvent` with actor, reason, and time; runtime role cannot update or delete audit |
| **Information disclosure** | IDOR on `/staff/reservations/{id}` across branches | Branch check after load → `404`; authorization sweep includes cross-branch cases |
| Enumeration | Iterating references, or probing which phones have bookings | Random references; code requests answer the same whether or not a phone has reservations; guest sessions see only their own phone's reservations; rate limits |
| PII in logs | Bodies or tokens logged | Logger allowlist (route, status, ids); no bodies, tokens, or `Authorization`; audit redaction |
| Token leakage | Token in URL query reaches logs or Referer | Fragment-only manage URL; `Referrer-Policy: strict-origin-when-cross-origin`; tokens hashed at rest; expiry |
| Availability scraping | Bots map occupancy | Public results are booleans; rate limits |
| **Denial of service** | Flooding availability search | Rate limits; bounded date ranges; indexed queries; lock timeout `5s` |
| Inventory squatting | Many fake pay-at-hotel bookings, now confirmed immediately (ADR 024) | Verified phone required; 5 creates per hour per client; cap on upcoming pay-at-hotel website bookings per phone (Q-60); honeypot field; staff cancel; blocking |
| Marketing without consent | Broadcast reaches guests who never opted in or opted out | Audience query requires opt-in, excludes opt-outs and blocked numbers; tests per exclusion; audit per broadcast (ADR 028) |
| Messaging misconfiguration or abuse | An attacker or non-Admin edits the WhatsApp number or templates, or spams test messages | Admin-only `settings:edit`; audit of every change; template variables limited to an allowlist (no free-form personal data); test messages rate-limited; access token never in the browser |
| Card data exposure | Card details touch Rivana | Hosted checkout only; no card fields, iframes, or scripts on Rivana pages; payloads stored minimally |
| Lock exhaustion | Many parallel creates on one room type | Short transactions; `lock_timeout`; rate limits |
| **Elevation of privilege** | Receptionist changes prices, coupons, VAT, refunds, or reaches CMS | Capability matrix in use cases; CMS and commercial capabilities not granted; sweep test per role |
| Role or branch self-assignment | A Manager edits their own assignments | Only `users:manage` (Admin) can assign |
| SQL injection | Raw availability SQL | Prisma tagged `$queryRaw` only; no string concatenation; lint rule banning `$queryRawUnsafe` |
| XSS | `specialRequests` rendered in admin | React escaping; plain text only; length limits; no `dangerouslySetInnerHTML` |
| Email header injection | Name with CR/LF | Validation rejects control characters; Nodemailer address objects |
| Open redirect | Return paths after staff login | Existing `return-path` validation |

## Authentication and authorization model

- Staff: `getCurrentStaff()` resolves the database session and loads `{ id, role, branchIds }`. Use cases call `authorize(principal, capability)`, then `authorizeBranch(principal, capability, branchId)` once the target's branch is known.
- Payment provider: no principal; the callback is trusted only after HMAC verification and amount checks.
- Guests: either a manage token (one reservation) or a 30-minute guest session obtained with a WhatsApp code (the reservations of that phone). With either, a guest may view and request cancellation, never cancel or refund directly. Both are bearer tokens, hashed at rest, checked for expiry, and limited to the resources they grant. A blocked phone gets no new codes or sessions.
- Public: no principal. Endpoints are rate-limited and never return personal data.
- The proxy (`src/proxy.ts`) remains optimistic only. It is not an authorization layer.

## Data protection

| Data | Stored | Visible to | Retention |
| --- | --- | --- | --- |
| Guest contact, requests | `Reservation` columns and `Guest` profile (phone, latest name and email, block status) | Staff with `guests:read`, limited to reservations of their branches; the holder of the manage link or of a session for that phone | Kept indefinitely (Q-13) |
| Verification records | `PhoneVerification` (phone, hashed code and token, client HMAC) | Not shown in the UI; used for limits and abuse investigation | Kept indefinitely; hashes are useless after expiry |
| Internal notes | `Reservation.internalNotes` | Staff of the branch | Same |
| Payment records | `Payment` (amounts, provider ids, status), `PaymentEvent` (event id, result, amount); no card data | Staff of the branch | Same as reservations |
| Marketing consent | `Guest.marketingOptInAt`, consent version, `marketingOptOutAt` | Staff with `guests:read`; used by the broadcast audience query | Same as guest data |
| Manage token | SHA-256 hash only; plaintext briefly in the outbox payload | Guest | Expiry 30 days after check-out; hash cleared |
| Client address | Never stored raw; HMAC counter keys only (existing `LoginThrottle`) | — | Window-limited |
| Audit changes | Redacted JSON (personal fields marked `changed`) | Manager, Admin | Longer than reservations (proposed 5 years), with no personal data |

- A privacy notice update is required before launch. It must cover what is collected for bookings, why, retention, and contact for requests. Consent is recorded as `privacyNoticeVersion` on the reservation.
- There is no export of guest lists or statistics (Q-14).
- Guest data is kept indefinitely by the owner's decision (Q-13). The privacy notice must say so (Q-30). Egypt's Personal Data Protection Law (Law 151 of 2020) and the laws of guests' home countries may limit indefinite retention or give guests deletion rights; the client should confirm this with an adviser (risk RK-14). This document is not legal advice.
- Phone numbers are sent to the WhatsApp provider to deliver codes, confirmations, feedback requests, and consented offers; the provider must be named in the privacy notice. Guest name, email, phone, and amount are sent to Paymob for online payments; Paymob must be named too (Q-30).

## Security tests (added to the existing sweep)

- Authorization sweep: every reservation, inventory, pricing, and report use case × {signed out, Editor, Receptionist (assigned), Receptionist (other branch), Manager (other branch), Admin}, refusing before any repository call.
- Route Handler tests: CSRF refusal (missing or foreign `Origin`), `415`, `413`, unknown fields, cross-branch `404`, token `401`, rate-limit `429`.
- Verification tests: expiry, attempt limit, rate limits per number and per client, blocked numbers, token single use, a session cannot read another phone's reservations.
- Enumeration tests: identical code-request responses for phones with and without reservations.
- Log redaction test: create a reservation and assert that the captured logs contain no email, phone, or token.
- Stored-XSS payloads in guest fields rendered in admin screens (E2E).
- Payment callback tests: missing or wrong HMAC, wrong amount or currency, unknown payment, duplicate, late success (C-12, C-13).
- Refund authorization: receptionist refused; other-branch manager refused; audit appended.
- Coupon tests: refusal reasons, limit race (C-11), rate limit on attempts.
- Broadcast audience tests: every exclusion rule (T-MKT).
- Bundle check: no Paymob or WhatsApp secret in client JavaScript.

## Residual risks

- Cross-system double booking (RK-1) is operational, not technical, and remains while sync is manual.
- Anyone holding a forwarded confirmation message can view the reservation and submit a cancellation request, which a Manager or Admin still has to approve. Anyone holding the guest's phone can see that number's reservations.
- A determined abuser with many real WhatsApp numbers can still make fake pay-at-hotel bookings, which are now confirmed immediately; per-phone caps, blocking, and staff cancellation limit the damage.
- Paymob account compromise or misconfigured callback URL; mitigated by secret management, HMAC, and reconciliation.
- Staff accounts are a high-value target. TOTP is recommended but is an approval item.
