# API contracts (v1)

Status: **Planned**, design accepted 2026-10-24, revised 2026-11-06 (immediate confirmation, several units per booking, services, coupons, VAT, Paymob, cancellation requests, broadcasts; ADRs 024–028). None of these endpoints is implemented. API-S7 and API-S8 (confirm and decline pending requests) are **retired** and must not be built. Shared rules (content type, errors, pagination, CSRF, headers) are in [rest-api-conventions.md](./rest-api-conventions.md) and [error-model.md](./error-model.md) and are not repeated per endpoint. Endpoint ids (`API-…`) are used in the [traceability matrix](../requirements/scope-traceability-matrix.md).

Legend: **Tx** = runs in one database transaction; **Lock** = takes the room-type inventory lock; **Idem** = requires `Idempotency-Key`; **Audit** = appends an `AuditEvent`.

## Common DTOs

```ts
type Money = { amountMinor: number /* cents */; currency: "USD" };
type Stay = { checkIn: string /* YYYY-MM-DD */; checkOut: string };
type Occupancy = { adults: number /* ≥1 */; children: number /* ≥0 */ };
type NightPrice = { night: string; amount: Money | null; source: "BASE" | "PERIOD" | "MANUAL" | null; label: string | null };
type BookingLineInput = { roomSlug: string; occupancy: Occupancy };           // one unit; repeat for several units
type ServiceKind = "BREAKFAST" | "AIRPORT_TRANSFER";
type QuoteLine = { roomType: RoomTypeSummary; occupancy: Occupancy; nights: NightPrice[]; subtotal: Money };
type Quote = {
  stay: Stay; lines: QuoteLine[];
  services: { kind: ServiceKind; price: Money }[];
  accommodation: Money; servicesTotal: Money; subtotal: Money;
  coupon: { code: string; kind: "PERCENT" | "FIXED"; value: number } | null; discount: Money;
  taxable: Money; vatRateBasisPoints: number | null; vat: Money | null; total: Money | null;
  vatConfigured: boolean;
  offeredServices: { kind: ServiceKind; price: Money }[];                    // available, not chosen (cross-sell)
};
type GuestInput = { fullName: string; email: string; phone: string /* E.164 */; country?: string; specialRequests?: string };
type BranchSummary = { slug: string; name: string; summary: string | null; city: string | null; heroImage: Image | null; onlineBookingEnabled: boolean };
type RoomTypeSummary = { slug: string; name: string; accommodationType: "ROOM" | "APARTMENT"; shortDescription: string; maxAdults: number; maxChildren: number; bedroomCount: number | null; bathroomCount: number | null; heroImage: Image | null; detailUrl: string /* /{branch}/stay/{slug} */ };
type ReservationStatus = "AWAITING_PAYMENT" | "CONFIRMED" | "PAYMENT_FAILED" | "CANCELLED" | "CHECKED_IN" | "CHECKED_OUT" | "NO_SHOW";
type PaymentMethod = "PAY_AT_HOTEL" | "PAYMOB";
type CancellationRequestDto = { id: string; status: "OPEN" | "APPROVED" | "REJECTED" | "REFUND_PENDING" | "REFUND_FAILED" | "COMPLETED"; createdAt: string; decisionReason: string | null };
```

## Public endpoints

| Id | Method & path | Purpose | Request | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| API-P1 | `GET /api/v1/branches` | List active branches (chooser) | — | `200 { items: BranchSummary[] }` | Ordered by `sortOrder` |
| API-P2 | `GET /api/v1/branches/{branchSlug}` | Branch details | — | `200 BranchDetail` (contact, address, check-in and check-out times, map embed URL, hero image) | `404` if inactive or missing |
| API-P3 | `GET /api/v1/branches/{branchSlug}/room-types` | Published listings of a branch | `?type=ROOM\|APARTMENT` optional | `200 { items: RoomTypeSummary[] }` | CMS publication respected |
| API-P4 | `GET /api/v1/branches/{branchSlug}/room-types/{roomSlug}` | Listing facts | — | `200 RoomTypeDetail` | `404` if the listing is in another branch |
| API-P5 | `GET /api/v1/branches/{branchSlug}/availability?checkIn&checkOut&adults&children` | Search | query: `Stay & Occupancy` | `200 { stay, occupancy, results: [{ roomType: RoomTypeSummary, available: boolean, unitsAvailable: number /* capped at the per-booking maximum */, pricePerNight: Money[] , accommodationTotal: Money | null /* before VAT */, reason?: "SOLD_OUT" \| "OCCUPANCY" \| "UNPRICED" }] }` | No lock; rate-limited (60/min/client). AV-* and OC-* validation → `422` |
| API-P6 | `POST /api/v1/quotes` | Full quote | `{ branchSlug, stay, lines: BookingLineInput[], services: ServiceKind[], couponCode?: string, phone?: string /* verified phone, for per-phone coupon limits */ }` | `200 { available: boolean, unavailableLines: number[], quote: Quote }` | Server-computed (ADR 027). `422 COUPON_INVALID` with `context.reason`; `409 SERVICE_UNAVAILABLE`; rate-limited (20 coupon attempts per 10 min per client) |
| API-P7 | `POST /api/v1/reservations` | Create website booking | `{ branchSlug, stay, lines: BookingLineInput[], services: ServiceKind[], couponCode?: string, guest: GuestInput, phoneVerificationToken: string, paymentMethod: PaymentMethod, expectedTotal: Money, consent: { privacyNoticeVersion: string }, marketingOptIn?: { consentVersion: string }, website?: "" /* honeypot */ }`. `guest.phone` must equal the verified phone | Pay at hotel: `201 { reference, status: "CONFIRMED", total, manageUrl }`. Paymob: `201 { reference, status: "AWAITING_PAYMENT", holdExpiresAt, checkoutUrl, manageUrl }`. Replay: `200 { reference, status, checkoutUrl?: string, manageUrl: null }` | **Tx, Lock, Idem, Audit** (ADR 024, 025); consumes the verification token; upserts the guest profile; coupon row locked and redemption written; confirmations queued only when `CONFIRMED`. Errors: `401 PHONE_NOT_VERIFIED`, `403 PHONE_BLOCKED`, `409 INVENTORY_UNAVAILABLE`, `409 PRICE_CHANGED`, `422 COUPON_INVALID`, `409 BRANCH_NOT_BOOKABLE` (incl. VAT not configured), `409 PAYMENT_METHOD_UNAVAILABLE`, `503 PAYMENT_UNAVAILABLE` (checkout could not be created; booking set `PAYMENT_FAILED`), `429 BOOKING_LIMIT_REACHED` (per-phone caps, Q-60), `422`, `429` (5/hour/client) |
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
| API-S20 | `GET /api/v1/staff/branches/{branchId}/availability?from&to` | `inventory:read` | range ≤ 62 nights | `200 { roomTypes: [{ id, name, nights: [{ night, capacity, sold, free, blocked }] }], lastSyncCheckpoint }` | Read model |
| API-S21 | `GET /api/v1/staff/branches/{branchId}/physical-rooms` | `inventory:read` | — | `200 { items: PhysicalRoomDto[] }` | |
| API-S22 | `POST /api/v1/staff/branches/{branchId}/physical-rooms` | `inventory:manage` | `{ roomTypeId, label, notes? }` | `201` | Audit; `409` on duplicate label |
| API-S23 | `PATCH /api/v1/staff/physical-rooms/{id}` | `inventory:manage` | `{ label?, notes?, active? }` | `200` | Deactivation: **Tx, Lock**; `409 INVENTORY_UNAVAILABLE` if it would oversell |
| API-S24 | `GET /api/v1/staff/branches/{branchId}/blocks?from&to` | `inventory:read` | — | `200 { items: BlockDto[] }` | |
| API-S25 | `POST /api/v1/staff/branches/{branchId}/blocks` | `inventory:block` | `{ physicalRoomId, startDate, endDate, reason, note? }` | `201 BlockDto` | **Tx, Lock, Audit**; `409` if it would oversell or overlap (Q-17) |
| API-S26 | `PATCH /api/v1/staff/blocks/{id}` | `inventory:block` | `{ endDate?, note? }` | `200` | Extending: **Lock** |
| API-S27 | `DELETE /api/v1/staff/blocks/{id}` | `inventory:block` | — | `204` | Soft cancel; audit |
| API-S28 | `POST /api/v1/staff/branches/{branchId}/sync-checkpoints` | `reservations:record-external` | `{ kind: "COMPLETED" \| "STARTED", note? }` | `201 SyncStatusDto` | **Audit**. `COMPLETED` clears the reminder for the whole branch; `STARTED` sets the next reminder to now + follow-up delay (Q-20) |
| API-S29 | `GET /api/v1/staff/branches/{branchId}/sync-status` | `reservations:read` | — | `200 { lastCompletedAt, lastCompletedBy, startedAt?, intervalMinutes, followUpMinutes, dueAt, due: boolean, notEnteredInHotelSystem: number, oldestNotEnteredAt?, serverTime }` | Polled by the staff shell every 60 seconds and on window focus; drives the sound and pop-up |

### Pricing

| Id | Method & path | Capability | Request | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| API-S30 | `GET /api/v1/staff/room-types/{roomTypeId}/rates?from&to` | `pricing:read` | — | `200 { baseRate: Money \| null, periods: RatePeriodDto[], calendar: NightPrice[] }` | |
| API-S31 | `PUT /api/v1/staff/room-types/{roomTypeId}/base-rate` | `pricing:manage` | `{ amount: Money }` | `200` | Audit before and after |
| API-S32 | `POST /api/v1/staff/room-types/{roomTypeId}/rate-periods` | `pricing:manage` | `{ startDate, endDate, amount, label? }` | `201` | `409` overlap with an active period (Q-44) |
| API-S33 | `PATCH /api/v1/staff/rate-periods/{id}` | `pricing:manage` | partial | `200` | Audit |
| API-S34 | `DELETE /api/v1/staff/rate-periods/{id}` | `pricing:manage` | — | `204` | Sets `active=false`; snapshots unaffected |

### Services, coupons, payments

| Id | Method & path | Capability | Request | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| API-S35 | `GET /api/v1/staff/branches/{branchId}/services` | `pricing:read` | — | `200 { items: { kind, price: Money, active, description }[] }` | |
| API-S36 | `PUT /api/v1/staff/branches/{branchId}/services/{kind}` | `services:manage` | `{ price: Money, active: boolean, description? }` | `200` | Audit before and after |
| API-S37 | `GET /api/v1/staff/coupons?branchId&active&q&page` | `coupons:manage` | filters | `200 Paged<CouponDto>` with redemption counts | Managers see codes valid at their branches |
| API-S38 | `POST /api/v1/staff/coupons` | `coupons:manage` | `{ code, kind, percentBasisPoints? , amount?: Money, startsAt?, endsAt?, maxRedemptions?, maxRedemptionsPerPhone?, allBranches: boolean, branchIds: string[], active, description? }` | `201 CouponDto` | Audit; `409` duplicate code; Manager: `allBranches` false and only assigned branches |
| API-S39 | `PATCH /api/v1/staff/coupons/{id}` | `coupons:manage` | partial | `200 CouponDto` | Audit; existing snapshots unaffected |
| API-S44 | `GET /api/v1/staff/reservations/{id}/payments` | `reservations:read` | — | `200 { items: PaymentDto[] }` (status, amount, provider transaction id, refund status; no card data) | |
| API-S45 | `POST /api/v1/staff/payments/{id}/refund-retry` | `cancellations:decide` | — | `202` | **Audit**; only for `REFUND_FAILED` |

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
| API-A1 | `GET /api/v1/staff/branches` | `inventory:read` | — | Caller's branches (Admin: all) |
| API-A2 | `POST /api/v1/staff/branches` | `branches:manage` | `BranchInput` | Audit |
| API-A3 | `PATCH /api/v1/staff/branches/{id}` | `branches:manage` | partial `BranchInput` incl. `status`, `onlineBookingEnabled` (refused while VAT is unset, WhatsApp is not configured, or `checkInTime` is missing), contact, address, `mapEmbedUrl` (Google embed allowlist), `checkInTime`, `checkOutTime`, `heroMediaId`, `syncReminderIntervalMinutes` (10–240), `syncFollowUpMinutes` (5–60, below the interval) | Audit; invalidates that branch's public cache tags |
| API-A5 | `GET` and `PUT /api/v1/staff/settings/commercial` | `GET`: `pricing:read`; `PUT`: `tax:manage` (Admin only) | `{ vatRateBasisPoints: number /* 0–10000; the Admin's chosen rate, Q-05 */ }` | Audit; applies to later quotes only (TX-5) |
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
