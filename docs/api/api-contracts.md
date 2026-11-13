# API contracts (v1)

Status: design accepted 2026-10-24, revised 2026-11-06 (immediate confirmation, several units per booking, services, coupons, VAT, Paymob, cancellation requests, broadcasts; ADRs 024–028). **Implemented:** `GET /api/v1/health` (M4) and the branch endpoints API-P1…P4 and API-A1…A3 (M5, spec [0002](../specs/0002-m5-branch-websites.md)), all documented in [openapi.json](./openapi.json). Inventory and pricing API-P5, API-S20…S27, API-S30…S34 (M6), services API-S35…S36 and commercial settings API-A5 (M7-T4), and coupons API-S37…S39 (M7-T5) are also **implemented** and documented in OpenAPI. Other endpoints are **planned**. API-S7 and API-S8 (confirm and decline pending requests) are **retired** and must not be built. Shared rules (content type, errors, pagination, CSRF, headers) are in [rest-api-conventions.md](./rest-api-conventions.md) and [error-model.md](./error-model.md) and are not repeated per endpoint. Endpoint ids (`API-…`) are used in the [traceability matrix](../requirements/scope-traceability-matrix.md).

Legend: **Tx** = runs in one database transaction; **Lock** = takes the room-type inventory lock; **Idem** = requires `Idempotency-Key`; **Audit** = appends an `AuditEvent`.

## Common DTOs

```ts
type Money = { amountMinor: number /* cents */; currency: "USD" };
type Stay = { checkIn: string /* YYYY-MM-DD */; checkOut: string };
type Occupancy = { adults: number /* ≥1 */; children: number /* ≥0 */ };
type NightPrice = { night: string; amount: Money | null; source: "BASE" | "PERIOD" | "MANUAL" | null; label: string | null };
type BookingLineInput = { roomSlug: string; occupancy: Occupancy };           // one unit; repeat for several units
type ServiceKind = "BREAKFAST" | "AIRPORT_TRANSFER";
type QuoteNight = { night: string; amount: Money; label: string | null };                 // every night is priced when a quote exists
type QuoteLine = { roomSlug: string; roomName: string; accommodationType: "ROOM" | "APARTMENT"; occupancy: Occupancy; nights: QuoteNight[]; accommodation: Money };
type QuoteServiceLine = { kind: ServiceKind; unit: ServicePriceUnit; price: Money /* adult or only price */; childPrice: Money | null; adults: number; children: number; nights: number; adultQuantity: number; childQuantity: number; amount: Money };
type Quote = {                                                                  // M7-T6; only chosen services appear, offers of other services are a UI concern (M10)
  stay: Stay; lines: QuoteLine[]; services: QuoteServiceLine[];
  coupon: { code: string; kind: "PERCENT" | "FIXED"; percentBasisPoints: number | null; amount: Money | null } | null;
  accommodation: Money; servicesTotal: Money; subtotal: Money; discount: Money; taxable: Money;
  vatRateBasisPoints: number; vat: Money; total: Money;                         // VAT is never null (Q-05 amended)
};
type GuestInput = { fullName: string; email: string; phone: string /* E.164 */; country?: string; specialRequests?: string };
type Image = { src: string; alt: string; width: number; height: number };   // ready, rights-confirmed library image
type BranchSummary = { slug: string; name: string; summary: string | null; city: string | null; heroImage: Image | null; onlineBookingEnabled: boolean };
type RoomTypeSummary = { slug: string; name: string; accommodationType: "ROOM" | "APARTMENT"; shortDescription: string; maxAdults: number; maxChildren: number; bedroomCount: number | null; bathroomCount: number | null; heroImage: Image | null; detailUrl: string /* /{branch}/stay/{slug} */ };
type ReservationStatus = "AWAITING_PAYMENT" | "CONFIRMED" | "PAYMENT_FAILED" | "CANCELLED" | "CHECKED_IN" | "CHECKED_OUT" | "NO_SHOW";
type PaymentMethod = "PAY_AT_HOTEL" | "PAYMOB";
type CancellationRequestDto = { id: string; status: "OPEN" | "APPROVED" | "REJECTED" | "REFUND_PENDING" | "REFUND_FAILED" | "COMPLETED"; createdAt: string; decisionReason: string | null };
```

## Public endpoints

| Id | Method & path | Purpose | Request | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| API-P1 | `GET /api/v1/branches` | List active branches (chooser) | — | `200 { items: BranchSummary[] }` | Ordered by `sortOrder`. **Implemented (M5)** |
| API-P2 | `GET /api/v1/branches/{branchSlug}` | Branch details | — | `200 BranchDetail` (contact, address, check-in and check-out times, map embed URL, hero image) | `404` if inactive or missing. **Implemented (M5)** |
| API-P3 | `GET /api/v1/branches/{branchSlug}/room-types` | Published listings of a branch | `?type=ROOM\|APARTMENT` optional | `200 { items: RoomTypeSummary[] }` | CMS publication respected. **Implemented (M5)** |
| API-P4 | `GET /api/v1/branches/{branchSlug}/room-types/{roomSlug}` | Listing facts | — | `200 RoomTypeDetail` | `404` if the listing is in another branch. **Implemented (M5)** |
| API-P5 | `GET /api/v1/branches/{branchSlug}/availability?checkIn&checkOut&adults&children&unitsRequested` | Search | query: `Stay & Occupancy`, plus optional `unitsRequested` integer 1–5, default 1 (Q-68, Q-69) | `200 { stay, occupancy, results: [{ roomType: RoomTypeSummary, available: boolean, unitsAvailable: number /* capped at 5 */, pricePerNight: Money[] , accommodationTotal: Money | null /* requested quantity, before VAT */, reason?: "SOLD_OUT" \| "OCCUPANCY" \| "UNPRICED" }] }` | No lock or caching; rate-limited (60/min/client). Malformed/missing/unknown/duplicate query parameters → `400`; AV-* and OC-* value validation → `422`. Active-branch search is allowed while booking is disabled (Q-70); creation readiness checks still apply. Inactive or missing branch → `404`. **Implemented (M6-T10)** |
| API-P6 | `POST /api/v1/quotes` | Full quote | `{ branchSlug, stay, lines: BookingLineInput[] /* 1 to 5 units */, services: ServiceKind[], couponCode?: string, phone?: string /* only for the per phone coupon limit; never stored or logged */ }`, strict (any price, discount, tax, or total key is `422`) | `200 { available: boolean, unavailableLines: number[] /* indexes into lines */, bookable: boolean /* branch takes online bookings and the quote is available */, quote: Quote \| null /* null only when a line is unavailable */ }`, `Cache-Control: no-store` | **Implemented (M7-T6).** Server computed (ADR 027); no lock, hold, cache, or write. Order: stay, branch, listings and occupancy, availability, prices, services, coupon, VAT. `404` unknown or inactive branch; `422` for a listing outside the branch, too many guests, or stay rules (field errors under `lines.N.*` and `stay.*`); `409 SERVICE_UNAVAILABLE` with `context.kind`; `422 COUPON_INVALID` with `context.reason`, one message for every reason. Limits: every request 60 per minute per client (`quote`); a request that sends `couponCode` also takes 20 per 10 minutes (`quote-coupon`); `429` with `Retry-After` |
| API-P7 | `POST /api/v1/reservations` | Create website booking | `{ branchSlug, stay, lines: BookingLineInput[], services: ServiceKind[], couponCode?: string, guest: GuestInput, phoneVerificationToken: string, paymentMethod: PaymentMethod, expectedTotal: Money, consent: { privacyNoticeVersion: string }, marketingOptIn?: { consentVersion: string }, website?: "" /* honeypot */ }`. `guest.phone` must equal the verified phone | Pay at hotel: `201 { reference, status: "CONFIRMED", total, manageUrl }`. Paymob: `201 { reference, status: "AWAITING_PAYMENT", holdExpiresAt, checkoutUrl, manageUrl }`. Replay: `200 { reference, status, checkoutUrl?: string, manageUrl: null }` | **Tx, Lock, Idem, Audit** (ADR 024, 025); consumes the verification token; upserts the guest profile; coupon row locked and redemption written; confirmations queued only when `CONFIRMED`. Errors: `401 PHONE_NOT_VERIFIED`, `403 PHONE_BLOCKED`, `409 INVENTORY_UNAVAILABLE`, `409 PRICE_CHANGED`, `422 COUPON_INVALID`, `409 BRANCH_NOT_BOOKABLE` (branch inactive, booking disabled, WhatsApp not configured, or check-in time missing), `409 PAYMENT_METHOD_UNAVAILABLE`, `503 PAYMENT_UNAVAILABLE` (checkout could not be created; booking set `PAYMENT_FAILED`), `429 BOOKING_LIMIT_REACHED` (per-phone caps, Q-60), `422`, `429` (5/hour/client) |
| API-P8 | `POST /api/v1/payments/paymob/callback` | Paymob transaction and refund results (webhook) | Raw Paymob payload and HMAC | `200` once a verified event is recorded (also for duplicates); `401 WEBHOOK_SIGNATURE_INVALID` otherwise | No session, no CSRF (`webhookRoute`); HMAC, amount, and currency checks; idempotent per provider event (PY-3, PY-4); **Tx, Audit** |
| API-P9 | `POST /api/v1/phone-verifications` | Send a WhatsApp code | `{ phone: string /* E.164 */, purpose: "BOOKING" \| "GUEST_SESSION" }` | `201 { verificationId, expiresAt, resendAvailableAt }` | Rate limits GV-1 → `429`. Blocked phone → `403 PHONE_BLOCKED` with a contact message (Q-29). WhatsApp delivery failure → `503 VERIFICATION_UNAVAILABLE` |
| API-P10 | `POST /api/v1/phone-verifications/{verificationId}/confirmation` | Check the code | `{ code: string /* 6 digits */ }` | `200 { token, expiresAt }` | Wrong code → `422 VERIFICATION_CODE_INVALID` with `attemptsLeft`; after 5 attempts or expiry → `410 VERIFICATION_EXPIRED` |
| API-G1 | `GET /api/v1/guest/reservation` | Guest view of one reservation | `Authorization: Bearer <manage token>` | `200 GuestReservationDto` (reference, status, payment method and status, branch, units, stay, occupancy, guest contact, price breakdown with VAT, cancellation deadline, open or last cancellation request, allowed actions) | `401` invalid or expired token. Also used by the payment-return page |
| API-G2 | `POST /api/v1/guest/reservation/cancellation-requests` | Guest requests cancellation (manage link) | Bearer manage token; `{ reason?: string }` | `201 CancellationRequestDto` | **Tx, Audit**; `CONFIRMED` only, before the deadline (CX-1, CX-2). `409 CANCELLATION_WINDOW_CLOSED` (branch contact in `context`), `409 CANCELLATION_REQUEST_EXISTS`, `409 INVALID_TRANSITION` |
| API-G3 | `GET /api/v1/guest/reservations` | "My reservations" for a verified phone | `Authorization: Bearer <guest session token>` (API-P10, 30 minutes) | `200 { items: GuestReservationSummary[] }`, newest first | `401` invalid or expired session |
| API-G4 | `GET /api/v1/guest/reservations/{reference}` and `POST …/{reference}/cancellation-requests` | Detail and cancellation request via the guest session | guest session token | as G1 and G2 | `404` if the reservation is not this phone's |

## Staff endpoints

Authentication: staff session cookie. Authorization: listed capability **and** branch access. "Branch" is the reservation's or resource's branch. Lists require `branchId` unless the caller is Admin, in which case it is optional and means all branches.

### Reservations

| Id | Method & path | Capability | Request | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| API-S1 | `GET /api/v1/staff/reservations?branchId&status&source&from&to&q&page&pageSize&sort` | `reservations:read` | filters; `q` matches reference, guest name, email, phone, external ref | `200 Paged<ReservationListItem>` | `from`/`to` filter stays overlapping the range. Personal data included only with `guests:read` |
| API-S2 | `GET /api/v1/staff/reservations/{id}` | `reservations:read` | — | `200 StaffReservationDto` + `ETag` | Includes nights, assignment, history summary, allowed actions for this caller |
| API-S3 | `POST /api/v1/staff/reservations` | `reservations:create` | `{ branchId, stay, lines: { roomTypeId, occupancy }[], services?: ServiceKind[], couponCode?, guest (email optional), notes?, priceOverride?: { lines: { nights: { night, amountMinor }[] }[], reason }, sendConfirmation: boolean }` | `201 StaffReservationDto` | **Tx, Lock, Idem, Audit**; status `CONFIRMED`; pay at hotel; override needs `pricing:override` |
| API-S4 | `POST /api/v1/staff/external-reservations` | `reservations:record-external` | `{ branchId, stay, lines: { roomTypeId, occupancy, amounts?: { nights[] } }[], guest, externalReference, channel?: string, notes? }` | `201 StaffReservationDto` | **Tx, Lock, Idem, Audit**; `409 INVENTORY_UNAVAILABLE` here is a cross-system conflict, so the UI shows the escalation procedure; `409 EXTERNAL_REFERENCE_EXISTS` |
| API-S5 | `PATCH /api/v1/staff/reservations/{id}` | `reservations:modify` | `If-Match`; `{ guest?: Partial<GuestInput>, internalNotes?, specialRequests? }` | `200 StaffReservationDto` | **Tx, Audit** (personal data redacted) |
| API-S6 | `PUT /api/v1/staff/reservations/{id}/stay` | `reservations:modify` | `If-Match`; `{ stay, lines: { roomTypeId, occupancy }[], acceptedTotal: Money, priceOverride? }` | `200 StaffReservationDto` | **Tx, Lock (old+new listings), Audit**; `409 PRICE_CHANGED` if `acceptedTotal` differs from the re-quote including VAT (PR-11); prepaid differences per Q-66 |
| ~~API-S7~~, ~~API-S8~~ | ~~confirm / decline~~ | — | — | — | **Retired** (ADR 024): no `PENDING` status exists |
| API-S9 | `POST /api/v1/staff/reservations/{id}/cancellation` | `reservations:cancel` (unpaid) or `reservations:cancel-paid` (paid) | `If-Match`; `{ reason: "GUEST_REQUEST" \| "CROSS_SYSTEM_CONFLICT" \| "INVALID_DETAILS" \| "OTHER", note?, notifyGuest: boolean }` | `200` (unpaid: `CANCELLED`) or `202` (paid: refund requested, `CANCELLED` when Paymob confirms) | **Tx, Audit**; releases inventory and coupon redemption |
| API-S10 | `PUT /api/v1/staff/reservations/{id}/rooms/{lineId}/assignment` | `reservations:front-desk` | `If-Match`; `{ physicalRoomId \| null }` | `200` | **Tx, Audit**; `409 ROOM_ALREADY_ASSIGNED` / `ROOM_BLOCKED` |
| API-S11 | `POST /api/v1/staff/reservations/{id}/check-in` | `reservations:front-desk` | `If-Match` | `200` | Requires assignment and date ≥ check-in |
| API-S12 | `POST /api/v1/staff/reservations/{id}/check-out` | `reservations:front-desk` | `If-Match` | `200` | Shortens an early departure (IN-3) |
| API-S13 | `POST /api/v1/staff/reservations/{id}/no-show` | `reservations:front-desk` | `If-Match`; `{ note? }` | `200` | |
| API-S14 | `POST /api/v1/staff/reservations/{id}/manage-link` | `reservations:modify` | — | `202` | Rotates token, sends it by email and WhatsApp |
| API-S15 | `GET /api/v1/staff/reservations/{id}/history` | `reservations:read` | — | `200 { items: AuditEventDto[] }` | |
| API-S16 | `POST /api/v1/staff/reservations/{id}/pms-entry` | `reservations:pms-entry` | `If-Match`; `{ note? }` | `200 StaffReservationDto` | **Audit**; `WEBSITE` only; sets `pmsEnteredAt` once (`409` if already set) |
| API-S17 | `GET /api/v1/staff/cancellation-requests?branchId&status&page` | `cancellations:decide` | filters | `200 Paged<CancellationRequestListItem>` (reservation reference, arrival, deadline, payment method and amount, status) | |
| API-S18 | `POST /api/v1/staff/cancellation-requests/{id}/approval` | `cancellations:decide` | `{ note? }` | `200` (unpaid: completed) or `202` (refund pending) | **Tx, Audit**; refund through Paymob for paid bookings (CX-5) |
| API-S19 | `POST /api/v1/staff/cancellation-requests/{id}/rejection` | `cancellations:decide` | `{ reason: string }` | `200` | **Tx, Audit**; guest messaged with the reason |

### Availability and inventory

| Id | Method & path | Capability | Request | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| API-S20 | `GET /api/v1/staff/branches/{branchId}/availability?from&to` | `inventory:read` | range ≤ 62 nights | `200 { roomTypes: [{ id, name, nights: [{ night, capacity, sold, free, blocked }] }], lastSyncCheckpoint }` | Implemented (M6-T8). Window of at most 62 nights (`422` otherwise; unknown or missing query keys are `400`). Every listing of the branch in any publication status, ordered by `sortOrder` then `id`, each with every requested night (zero counts without an active unit). `lastSyncCheckpoint` is null until M8. Never cached. Hidden or unknown branch: `403` or `404` |
| API-S21 | `GET /api/v1/staff/branches/{branchId}/physical-rooms` | `inventory:read` | — | `200 { items: PhysicalRoomDto[] }` | |
| API-S22 | `POST /api/v1/staff/branches/{branchId}/physical-rooms` | `inventory:manage` | `{ roomTypeId, label, notes? }` | `201` + `Location` | Audit; `409` on duplicate label. `label` trimmed, 1 to 40 characters; `notes` trimmed, at most 500, and `null`, empty, or whitespace only is stored as no note |
| API-S23 | `PATCH /api/v1/staff/physical-rooms/{id}` | `inventory:manage` | `{ label?, notes?, active? }` | `200` | Deactivation: **Tx, Lock**; `409 INVENTORY_UNAVAILABLE` if it would oversell; `503 TRY_AGAIN` (`Retry-After: 5`) on lock timeout. Blank `notes` clears the note; `null` also clears it |
| API-S24 | `GET /api/v1/staff/branches/{branchId}/blocks?from&to` | `inventory:read` | — | `200 { items: BlockDto[] }` | Implemented (M6-T6). Uncancelled blocks overlapping `[from, to)`, at most 62 nights (`422` otherwise); ordered by start, unit, id |
| API-S25 | `POST /api/v1/staff/branches/{branchId}/blocks` | `inventory:block` | `{ physicalRoomId, startDate, endDate, reason, note? }` | `201 BlockDto` + `Location` | **Tx, Lock, Audit**; `409 INVENTORY_UNAVAILABLE` naming `context.firstUnavailableNight` if it would oversell, `409 CONFLICT` with `startDate`/`endDate` field errors on overlap (`startDate`, plus `endDate` from the database constraint) or an inactive unit (`physicalRoomId`), `404` for a unit outside the path branch, `503 TRY_AGAIN` on lock timeout. Implemented (M6-T6). `note` trimmed, at most 500, blank stored as none; blocks may start in the past |
| API-S26 | `PATCH /api/v1/staff/blocks/{id}` | `inventory:block` | `{ endDate?, note? }` | `200 BlockDto` | Any `endDate` change: **Tx, Lock** (also when shortening); note only: block row lock, no listing lock. `409` for a cancelled block, overlap, or oversell. An overlap names `endDate`. Changing the end of a block on a since deactivated unit is allowed: it only affects a unit that already contributes no capacity. Branch, unit, start, and reason cannot change. Implemented (M6-T6) |
| API-S27 | `DELETE /api/v1/staff/blocks/{id}` | `inventory:block` | — | `204` | Soft cancel under the block row lock only; audit. Repeating it returns `204` with no second audit event. Implemented (M6-T6) |
| API-S28 | `POST /api/v1/staff/branches/{branchId}/sync-checkpoints` | `reservations:record-external` | `{ kind: "COMPLETED" \| "STARTED", note? }` | `201 SyncStatusDto` | **Audit**. `COMPLETED` clears the reminder for the whole branch; `STARTED` sets the next reminder to now + follow-up delay (Q-20) |
| API-S29 | `GET /api/v1/staff/branches/{branchId}/sync-status` | `reservations:read` | — | `200 { lastCompletedAt, lastCompletedBy, startedAt?, intervalMinutes, followUpMinutes, dueAt, due: boolean, notEnteredInHotelSystem: number, oldestNotEnteredAt?, serverTime }` | Polled by the staff shell every 60 seconds and on window focus; drives the sound and pop-up |

### Pricing

| Id | Method & path | Capability | Request | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| API-S30 | `GET /api/v1/staff/room-types/{roomTypeId}/rates?from&to` | `pricing:read` | — | `200 { baseRate: Money \| null, periods: RatePeriodDto[], calendar: NightPrice[] }` | Implemented (M6-T7). Window of at most 62 nights (`422` otherwise). Periods are every active or inactive period intersecting the window; the calendar has one entry per night, an active period overriding the base, and a null amount where neither applies. Hidden or foreign listing: `404` |
| API-S31 | `PUT /api/v1/staff/room-types/{roomTypeId}/base-rate` | `pricing:manage` | `{ amount: Money }` | `200` | Audit before and after. Implemented (M6-T7). Creates or replaces the base rate (positive whole USD cents within PostgreSQL `INTEGER`); `before` is the actual locked predecessor, `null` on first creation. Repeating the same amount writes nothing and no audit. Never takes the listing inventory lock. `503 TRY_AGAIN` on lock timeout |
| API-S32 | `POST /api/v1/staff/room-types/{roomTypeId}/rate-periods` | `pricing:manage` | `{ startDate, endDate, amount, label? }` | `201` + `Location` | `409` overlap with an active period (Q-44) with `startDate`/`endDate` field errors; adjacent and inactive overlaps are valid. Implemented (M6-T7). `503 TRY_AGAIN` (`Retry-After: 5`) when the exclusion check waits more than five seconds. PostgreSQL `40P01` between competing exclusion checks maps to the same safe `409`. Audited |
| API-S33 | `PATCH /api/v1/staff/rate-periods/{id}` | `pricing:manage` | partial | `200` | Audit. Implemented (M6-T7). Locks the period row, then merges the patch; reactivation and date changes are checked by the exclusion constraint (`409` field errors, no partial state). An unchanged patch writes nothing |
| API-S34 | `DELETE /api/v1/staff/rate-periods/{id}` | `pricing:manage` | — | `204` | Sets `active=false`; snapshots unaffected. Implemented (M6-T7). Repeating it returns `204` with no second audit event. Hidden or foreign id: `404` |

### Services, coupons, payments

| Id | Method & path | Capability | Request | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| API-S35 | `GET /api/v1/staff/branches/{id}/services` | `pricing:read` (branch scoped) | — | `200 { items: { kind, priceUnit: ServicePriceUnit \| null, price: Money \| null, childPrice: Money \| null, active, description: string \| null, updatedAt: string \| null }[] }` | **Implemented (M7-T4).** Always two items, one per kind (`BREAKFAST`, `AIRPORT_TRANSFER`). A kind the branch has not set up yet is shown inactive with `priceUnit`, `price`, `childPrice`, `description`, and `updatedAt` all `null`. `403` outside the Manager or Receptionist branch scope, `404` for an unknown branch |
| API-S36 | `PUT /api/v1/staff/branches/{id}/services/{kind}` | `services:manage` (branch scoped) | `{ priceUnit: ServicePriceUnit, price: Money, childPrice?: Money /* person units only */, active: boolean, description? }` | `200` with the stored offering (same shape as an S35 item) | **Implemented (M7-T4).** Creates or replaces the branch offering under a row lock. Audit `service.update` with before and after prices, unit, and active flag, plus `descriptionChanged` (the text is never copied); an identical write returns `200` and adds no audit event. `403` for a branch outside the Manager scope (Receptionists and Editors never write), `404` unknown branch, `422` for an unknown kind, a price below 1 or above the integer limit, or a child price on a per booking or per night unit, `503 TRY_AGAIN` if the row stays locked for 5 seconds |
| API-S37 | `GET /api/v1/staff/coupons?branchId&active&q&page` | `coupons:manage` | filters | `200 Paged<CouponDto>` with redemption counts | **Implemented (M7-T5).** Admin sees all; Managers see only non-global coupons whose entire nonempty branch list is assigned. Scope applies before pagination and counts; coupon and branch data share one statement snapshot. Page size 20; code search is a case-insensitive literal substring; redemption counts are zero until M8 |
| API-S38 | `POST /api/v1/staff/coupons` | `coupons:manage` | `{ code, kind, percentBasisPoints? , amount?: Money, startsAt?, endsAt?, maxRedemptions?, maxRedemptionsPerPhone?, allBranches: boolean, branchIds: string[], active, description? }` | `201 CouponDto` | **Implemented (M7-T5), Tx, Audit.** `Location` names the new coupon. Codes normalized uppercase, unique case-insensitively (`409`). Manager: `allBranches` false and every branch assigned (`403` otherwise). Global scope requires empty `branchIds`; specific scope requires distinct existing branches |
| API-S39 | `PATCH /api/v1/staff/coupons/{id}` | `coupons:manage` | partial | `200 CouponDto` | **Implemented (M7-T5), Tx, Audit.** Code is immutable; omitted fields retain values, `null` clears optional fields. Complete merged state validated under row lock. Current inaccessible scope returns `404`; resulting unauthorized scope returns `403`; invalid state returns `422`. No-op adds no audit event. `503 TRY_AGAIN` after 5 seconds waiting for the lock |
| API-S44 | `GET /api/v1/staff/reservations/{id}/payments` | `reservations:read` | — | `200 { items: PaymentDto[] }` (status, amount, provider transaction id, refund status; no card data) | |
| API-S45 | `POST /api/v1/staff/payments/{id}/refund-retry` | `cancellations:decide` | — | `202` | **Audit**; only for `REFUND_FAILED` |

Coupon DTOs (S37–S39) contain `id`, normalized `code`, `kind`, nullable `percentBasisPoints` and `amount`, nullable UTC `startsAt` and `endsAt`, nullable `maxRedemptions` and `maxRedemptionsPerPhone`, `allBranches`, `branchIds`, `active`, nullable staff-only `description`, UTC `createdAt` and `updatedAt`, and `redemptionsTotal` (zero until M8). Lists use `{ items, page, pageSize, total }`. Authoring accepts only the value matching the kind: percent 1–10000 integer basis points, or fixed USD 1–2147483647 cents. Limits are null or positive integers up to 2147483647; both dates require `endsAt > startsAt`; description is at most 300 characters. Empty patches, code changes, and unknown body fields are `422`. Coupon mutations need neither `Idempotency-Key` nor `If-Match` (spec 0004). Audit uses `branchId: null` for multi-branch coupons, records before/after values, and flags description changes without copying free text.

### Marketing (M13)

| Id | Method & path | Capability | Request | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| API-S60 | `GET /api/v1/staff/broadcasts?page` | `marketing:broadcast` | — | `200 Paged<BroadcastDto>` | Branch-scoped |
| API-S61 | `POST /api/v1/staff/broadcasts/audience-preview` | `marketing:broadcast` | `{ branchIds: string[] }` | `200 { count }` | Opted in, not opted out, not blocked, outside the frequency window (Q-58) |
| API-S62 | `POST /api/v1/staff/broadcasts` | `marketing:broadcast` | `{ branchIds, templateName, variables, couponId? }` + `Idempotency-Key` | `202 BroadcastDto` | **Tx, Audit**; one outbox row per recipient |

### Guests

| Id | Method & path | Capability | Request | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| API-S50 | `GET /api/v1/staff/guests?q&blocked&page` | `guests:read` | `q` matches phone or name | `Paged<GuestListItem>` (phone, name, verified, blocked, reservation count in accessible branches) | |
| API-S51 | `GET /api/v1/staff/guests/{id}` | `guests:read` | — | `200 GuestDto` with reservations in accessible branches and block history | |
| API-S52 | `POST /api/v1/staff/guests/{id}/block` | `guests:block` | `{ reason: string }` | `200 GuestDto` | **Tx, Audit**; applies to all branches (Q-29); invalidates open verifications; excludes the phone from broadcasts |
| API-S54 | `POST /api/v1/staff/guests/{id}/marketing-opt-out` | `guests:read` | `{ note? }` | `200 GuestDto` | **Audit**; records an opt-out the guest gave the hotel (M13) |
| API-S53 | `DELETE /api/v1/staff/guests/{id}/block` | `guests:block` | `{ reason: string }` | `200 GuestDto` | **Tx, Audit** |

### Reporting and audit

| Id | Method & path | Capability | Response | Notes |
| --- | --- | --- | --- | --- |
| API-S40 | `GET /api/v1/staff/reports/summary?branchId&from&to` | `reports:read` | counts by status, source, and payment method, room-nights sold, occupancy %, revenue excluding VAT (priced only), VAT, discounts, online payments captured and refunded, average daily rate, unpriced count, PMS-entry ages, cancellation requests | Definitions in [functional-requirements.md](../requirements/functional-requirements.md#fr-rpt-reporting--planned-m12) |
| API-S41 | `GET /api/v1/staff/reports/occupancy?branchId&from&to&groupBy=day\|week\|month` | `reports:read` | series per room type | Range ≤ 366 days |
| API-S42 | `GET /api/v1/staff/reports/room-types?branchId&from&to` | `reports:read` | per room type: nights sold, occupancy, revenue, cancellations | "Room performance" (PDF section 10) |
| API-S43 | `GET /api/v1/staff/audit-events?branchId&entityType&entityId&actorId&from&to&page` | `audit:read` | `Paged<AuditEventDto>` | |

### Administration (Admin)

| Id | Method & path | Capability | Request | Notes |
| --- | --- | --- | --- | --- |
| API-A1 | `GET /api/v1/staff/branches` | `inventory:read` | — | Caller's branches (Admin: all). **Implemented (M5)** |
| API-A2 | `POST /api/v1/staff/branches` | `branches:manage` | `BranchInput` | Audit. **Implemented (M5)** |
| API-A3 | `PATCH /api/v1/staff/branches/{id}` | `branches:manage` | partial `BranchInput` incl. `status`, `onlineBookingEnabled` (refused while WhatsApp is not configured, or `checkInTime` is missing), contact, address, `mapEmbedUrl` (Google embed allowlist), `checkInTime`, `checkOutTime`, `heroMediaId`, `syncReminderIntervalMinutes` (10–240), `syncFollowUpMinutes` (5–60, below the interval) | Audit; invalidates that branch's public cache tags. **Implemented (M5)** |
| API-A5 | `GET` and `PUT /api/v1/staff/settings/commercial` | `GET`: `pricing:read`; `PUT`: `tax:manage` (Admin only) | `{ vatRateBasisPoints: number /* 0–10000; the Admin's chosen rate, Q-05 */ }` | `200 { vatRateBasisPoints: number, updatedAt: string }` | **Implemented (M7-T4).** `PUT` locks the singleton row and audits `commercial.update` with `from` and `to`; the same value returns `200` with no audit event. An integer outside 0–10000, a fractional value, `null`, a string, a missing key, or an extra key is `422` with a `vatRateBasisPoints` field error and the stored rate stays. `503 TRY_AGAIN` if the row stays locked for 5 seconds. Applies to later quotes only (TX-5) |
| API-A6 | `GET` and `PUT /api/v1/staff/settings/whatsapp` | `settings:edit` (Admin) | `{ businessPhoneNumber: string \| null /* E.164 */, providerPhoneNumberId: string \| null }`; `GET` also returns `accessTokenConfigured: boolean`, the last test result, and setup gaps (purposes without an active template) | Audit; never returns or accepts the access token (Q-67) |
| API-A7 | `GET /api/v1/staff/whatsapp-templates`, `POST …`, `PATCH …/{id}` | `settings:edit` (Admin) | `{ purpose, language, providerName, category, variables: string[] /* allowlisted field keys */, previewText, active }` | Audit; `422` for unknown variable keys; one active template per purpose and language (except marketing) |
| API-A8 | `POST /api/v1/staff/settings/whatsapp/test-message` | `settings:edit` (Admin) | `{ phone: string /* E.164 */, templateId?: string }` | `200 { ok: true, providerMessageId }` or `502 WHATSAPP_TEST_FAILED` (provider error text, no secrets). Rate-limited (5 per 10 min); audit; result stored on the settings |
| API-A4 | `PUT /api/v1/staff/users/{userId}/branches` | `users:manage` | `{ branchIds: string[] }` | Audit; only for Receptionist and Manager |

Listing creation, editing, and publication (including the accommodation type), and branch page and facility content, stay in the CMS (Server Actions); they are not duplicated in the API. Moving a listing to another branch is not allowed once it has units or reservations.

## Transaction boundaries summary

| Operation | Transaction contents |
| --- | --- |
| Create (P7, S3, S4) | Idempotency check → verification and caps → lock listings (id order) → expire overdue holds → capacity/sold/rates/services → lock coupon → quote → insert reservation, lines, nights, services, redemption → audit → outbox (confirmations only when `CONFIRMED`) |
| Payment callback (P8) | Record event once → reservation `FOR UPDATE` → confirm or fail (late success re-locks listings) → audit → outbox |
| Cancellation decision (S18, S19, S9 paid) | Request and reservation `FOR UPDATE` → decision → (paid) refund requested after commit, completion on Paymob confirmation → release → audit → outbox |
| Transition (S9–S13, S16) | `SELECT … FOR UPDATE` reservation → version check → state machine → update status and `consumesInventory` → audit → outbox |
| Modify stay (S6) | Lock old and new types (sorted) → reservation `FOR UPDATE` → check → replace changed nights → audit |
| Block, unit deactivation (S23, S25, S26) | Lock unit's type → check sold versus new capacity → write → audit |
| Rate, service, coupon, VAT edits (S31–S39, A5) | Write → audit (no inventory lock) |
