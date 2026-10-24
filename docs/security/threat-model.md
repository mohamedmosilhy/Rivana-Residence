# Threat model, authorization, and data protection

The threats to Rivana and the controls against them. Implemented controls for authentication, uploads, content, the contact form, headers, and secrets are specified in [security-controls.md](./security-controls.md). This document covers the full threat model, with the reservation features (status: **Planned**, design accepted 2026-10-24, built in M4–M11) in most detail, because they add guest personal data and money-relevant state.

## Assets

- Website and content: published content integrity, the media store and upload pipeline, contact enquiries (visitor personal data), and the promotion popup. Their implemented controls are in [security-controls.md](./security-controls.md).
- Staff accounts, sessions, roles, and branch assignments.
- Reservations: guest personal data (name, email, phone, country, requests, stay dates); reservation integrity (status, prices, inventory); manage tokens; the audit trail; availability, which competitors or bots might scrape.

## Trust boundaries

1. Browser to `/api/v1` public endpoints (anonymous, hostile input).
2. Browser with manage token to `/api/v1/guest/*`.
3. Staff browser (session cookie) to `/api/v1/staff/*` and `/admin`.
4. Application to PostgreSQL (runtime role) and to SMTP.
5. Staff to the PMS (outside the system, by people).

## STRIDE analysis

| Threat | Example | Controls |
| --- | --- | --- |
| **Spoofing** staff | Stolen cookie, credential stuffing | Existing: HttpOnly, Secure, SameSite=Lax cookies, DB sessions, revocation, throttled generic login. Recommend TOTP for Admin and Manager before go-live (Better Auth plugin, not custom) |
| Spoofing guest | Guessing a reference; booking with someone else's phone | Reference alone grants nothing; 256-bit manage token; every online booking and every "My reservations" session needs a WhatsApp code sent to the phone (ADR 019) |
| Fake reservations | Bookings with invented or throwaway numbers | Mandatory WhatsApp verification; one guest profile per number; Manager or Admin blocks abusive numbers for all branches (Q-29); staff decline |
| Code brute force or interception | Guessing the 6-digit code | 10-minute expiry, 5 attempts, codes hashed at rest, constant-time compare, per-number and per-client limits |
| Message pumping | Bots requesting many codes to run up messaging costs | 3 codes per number per 15 minutes, 10 per day, per-client limits, honeypot; alert on unusual volume; WhatsApp authentication templates are less exposed to SMS toll fraud |
| **Tampering** price | Client sends a lower total | Server recomputes; `expectedTotal` only detects drift (PR-7); price fields not accepted on public create |
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
| Inventory squatting | Many fake pending requests | Verified phone required; 5 creates per hour per client; max 3 open pending per phone; honeypot field; staff decline; blocking |
| Lock exhaustion | Many parallel creates on one room type | Short transactions; `lock_timeout`; rate limits |
| **Elevation of privilege** | Receptionist changes prices or reaches CMS | Capability matrix in use cases; CMS capabilities not granted; sweep test per role |
| Role or branch self-assignment | A Manager edits their own assignments | Only `users:manage` (Admin) can assign |
| SQL injection | Raw availability SQL | Prisma tagged `$queryRaw` only; no string concatenation; lint rule banning `$queryRawUnsafe` |
| XSS | `specialRequests` rendered in admin | React escaping; plain text only; length limits; no `dangerouslySetInnerHTML` |
| Email header injection | Name with CR/LF | Validation rejects control characters; Nodemailer address objects |
| Open redirect | Return paths after staff login | Existing `return-path` validation |

## Authentication and authorization model

- Staff: `getCurrentStaff()` resolves the database session and loads `{ id, role, branchIds }`. Use cases call `authorize(principal, capability)`, then `authorizeBranch(principal, capability, branchId)` once the target's branch is known.
- Guests: either a manage token (one reservation) or a 30-minute guest session obtained with a WhatsApp code (the reservations of that phone). Both are bearer tokens, hashed at rest, checked for expiry, and limited to the resources they grant. A blocked phone gets no new codes or sessions.
- Public: no principal. Endpoints are rate-limited and never return personal data.
- The proxy (`src/proxy.ts`) remains optimistic only. It is not an authorization layer.

## Data protection

| Data | Stored | Visible to | Retention |
| --- | --- | --- | --- |
| Guest contact, requests | `Reservation` columns and `Guest` profile (phone, latest name and email, block status) | Staff with `guests:read`, limited to reservations of their branches; the holder of the manage link or of a session for that phone | Kept indefinitely (Q-13) |
| Verification records | `PhoneVerification` (phone, hashed code and token, client HMAC) | Not shown in the UI; used for limits and abuse investigation | Kept indefinitely; hashes are useless after expiry |
| Internal notes | `Reservation.internalNotes` | Staff of the branch | Same |
| Manage token | SHA-256 hash only; plaintext briefly in the outbox payload | Guest | Expiry 30 days after check-out; hash cleared |
| Client address | Never stored raw; HMAC counter keys only (existing `LoginThrottle`) | — | Window-limited |
| Audit changes | Redacted JSON (personal fields marked `changed`) | Manager, Admin | Longer than reservations (proposed 5 years), with no personal data |

- A privacy notice update is required before launch. It must cover what is collected for bookings, why, retention, and contact for requests. Consent is recorded as `privacyNoticeVersion` on the reservation.
- There is no export of guest lists or statistics (Q-14).
- Guest data is kept indefinitely by the owner's decision (Q-13). The privacy notice must say so (Q-30). Egypt's Personal Data Protection Law (Law 151 of 2020) and the laws of guests' home countries may limit indefinite retention or give guests deletion rights; the client should confirm this with an adviser (risk RK-14). This document is not legal advice.
- Phone numbers are sent to the WhatsApp provider to deliver codes and messages; the provider must be named in the privacy notice.

## Security tests (added to the existing sweep)

- Authorization sweep: every reservation, inventory, pricing, and report use case × {signed out, Editor, Receptionist (assigned), Receptionist (other branch), Manager (other branch), Admin}, refusing before any repository call.
- Route Handler tests: CSRF refusal (missing or foreign `Origin`), `415`, `413`, unknown fields, cross-branch `404`, token `401`, rate-limit `429`.
- Verification tests: expiry, attempt limit, rate limits per number and per client, blocked numbers, token single use, a session cannot read another phone's reservations.
- Enumeration tests: identical code-request responses for phones with and without reservations.
- Log redaction test: create a reservation and assert that the captured logs contain no email, phone, or token.
- Stored-XSS payloads in guest fields rendered in admin screens (E2E).

## Residual risks

- Cross-system double booking (RK-1) is operational, not technical, and remains while sync is manual.
- Anyone holding a forwarded confirmation message can view or cancel a pending reservation, as with most hotel links. Anyone holding the guest's phone can see that number's reservations.
- A determined abuser with many real WhatsApp numbers can still make fake requests; blocking and staff confirmation limit the damage.
- Staff accounts are a high-value target. TOTP is recommended but is an approval item.
