# API contracts (v1)

Status: **Planned**, design accepted 2026-10-24. None of these endpoints is implemented. Shared rules (content type, errors, pagination, CSRF, headers) are in [rest-api-conventions.md](./rest-api-conventions.md) and [error-model.md](./error-model.md) and are not repeated per endpoint. Endpoint ids (`API-…`) are used in the [traceability matrix](../requirements/scope-traceability-matrix.md).

Legend: **Tx** = runs in one database transaction; **Lock** = takes the room-type inventory lock; **Idem** = requires `Idempotency-Key`; **Audit** = appends an `AuditEvent`.

## Common DTOs

```ts
type Money = { amountMinor: number /* cents */; currency: "USD" };
type Stay = { checkIn: string /* YYYY-MM-DD */; checkOut: string };
type Occupancy = { adults: number /* ≥1 */; children: number /* ≥0 */ };
type NightPrice = { night: string; amount: Money | null; source: "BASE" | "SEASONAL" | "OFFER" | "MANUAL" | null; label: string | null };
type Quote = { stay: Stay; nights: NightPrice[]; total: Money };
type GuestInput = { fullName: string; email: string; phone: string /* E.164 */; country?: string; specialRequests?: string };
type BranchSummary = { slug: string; name: string; summary: string | null; city: string | null; onlineBookingEnabled: boolean };
type RoomTypeSummary = { slug: string; name: string; shortDescription: string; maxAdults: number; maxChildren: number; heroImage: Image | null; detailUrl: string };
type ReservationStatus = "PENDING" | "CONFIRMED" | "DECLINED" | "CANCELLED" | "CHECKED_IN" | "CHECKED_OUT" | "NO_SHOW";
```

## Public endpoints

| Id | Method & path | Purpose | Request | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| API-P1 | `GET /api/v1/branches` | List active branches | — | `200 { items: BranchSummary[] }` | Ordered by `sortOrder` |
| API-P2 | `GET /api/v1/branches/{branchSlug}` | Branch details | — | `200 BranchDetail` (contact, times, hero image) | `404` if inactive or missing |
| API-P3 | `GET /api/v1/branches/{branchSlug}/room-types` | Published room types of a branch | — | `200 { items: RoomTypeSummary[] }` | CMS publication respected |
| API-P4 | `GET /api/v1/branches/{branchSlug}/room-types/{roomSlug}` | Room type facts | — | `200 RoomTypeDetail` | `404` if room is in another branch |
| API-P5 | `GET /api/v1/branches/{branchSlug}/availability?checkIn&checkOut&adults&children` | Search | query: `Stay & Occupancy` | `200 { stay, occupancy, results: [{ roomType: RoomTypeSummary, available: boolean, quote: Quote | null, reason?: "SOLD_OUT" | "OCCUPANCY" | "UNPRICED" }] }` | No lock; rate-limited (60/min/client). AV-* and OC-* validation → `422` |
| API-P6 | `GET /api/v1/branches/{branchSlug}/room-types/{roomSlug}/quote?checkIn&checkOut&adults&children` | Price breakdown | same | `200 { available: boolean, quote: Quote }` | Same validation |
| API-P7 | `POST /api/v1/reservations` | Create website reservation (request to book) | `{ branchSlug, roomSlug, stay, occupancy, guest: GuestInput, phoneVerificationToken: string, expectedTotal: Money, consent: { privacyNoticeVersion: string }, website?: "" /* honeypot */ }`. `guest.phone` must equal the verified phone | `201 { reference, status: "PENDING", stay, roomType, total, manageUrl }` · replay `200 { reference, status, manageUrl: null }` | **Tx, Lock, Idem, Audit**; consumes the verification token; upserts the guest profile; messages the guest by email and WhatsApp; alerts staff. Errors: `401 PHONE_NOT_VERIFIED`, `403 PHONE_BLOCKED`, `409 INVENTORY_UNAVAILABLE`, `409 PRICE_CHANGED`, `422`, `429` (5/hour/client, 3 open pending per phone) |
| API-P9 | `POST /api/v1/phone-verifications` | Send a WhatsApp code | `{ phone: string /* E.164 */, purpose: "BOOKING" \| "GUEST_SESSION" }` | `201 { verificationId, expiresAt, resendAvailableAt }` | Rate limits GV-1 → `429`. Blocked phone → `403 PHONE_BLOCKED` with a contact message (Q-29). WhatsApp delivery failure → `503 VERIFICATION_UNAVAILABLE` |
| API-P10 | `POST /api/v1/phone-verifications/{verificationId}/confirmation` | Check the code | `{ code: string /* 6 digits */ }` | `200 { token, expiresAt }`: a booking verification token, or a guest session token for `GUEST_SESSION` | Wrong code → `422 VERIFICATION_CODE_INVALID` with `attemptsLeft`; after 5 attempts or expiry → `410 VERIFICATION_EXPIRED` |
| API-G1 | `GET /api/v1/guest/reservation` | Guest view of one reservation | `Authorization: Bearer <manage token>` | `200 GuestReservationDto` (reference, status, branch, room type, stay, occupancy, guest contact, total, nights, allowed actions) | `401` invalid or expired token |
| API-G2 | `POST /api/v1/guest/reservation/cancellation` | Guest cancels (manage link) | Bearer manage token; `{ reason?: string }` | `200 GuestReservationDto` | **Tx, Audit**; allowed for `PENDING` only (Q-07). Any other status returns `409 INVALID_TRANSITION` with the branch contact details in `context` |
| API-G3 | `GET /api/v1/guest/reservations` | "My reservations" for a verified phone | `Authorization: Bearer <guest session token>` (API-P10, 30 minutes) | `200 { items: GuestReservationSummary[] }`, newest first | `401` invalid or expired session |
| API-G4 | `GET /api/v1/guest/reservations/{reference}` and `POST …/{reference}/cancellation` | Detail and pending-only cancel via the guest session | guest session token | as G1 and G2 | `404` if the reservation is not this phone's |

## Staff endpoints

Authentication: staff session cookie. Authorization: listed capability **and** branch access. "Branch" is the reservation's or resource's branch. Lists require `branchId` unless the caller is Admin, in which case it is optional and means all branches.

### Reservations

| Id | Method & path | Capability | Request | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| API-S1 | `GET /api/v1/staff/reservations?branchId&status&source&from&to&q&page&pageSize&sort` | `reservations:read` | filters; `q` matches reference, guest name, email, phone, external ref | `200 Paged<ReservationListItem>` | `from`/`to` filter stays overlapping the range. Personal data included only with `guests:read` |
| API-S2 | `GET /api/v1/staff/reservations/{id}` | `reservations:read` | — | `200 StaffReservationDto` + `ETag` | Includes nights, assignment, history summary, allowed actions for this caller |
| API-S3 | `POST /api/v1/staff/reservations` | `reservations:create` | `{ branchId, roomTypeId, stay, occupancy, guest (email optional), notes?, priceOverride?: { nights: { night, amountMinor }[], reason } , sendConfirmation: boolean }` | `201 StaffReservationDto` | **Tx, Lock, Idem, Audit**; status `CONFIRMED`; override needs `pricing:override` |
| API-S4 | `POST /api/v1/staff/external-reservations` | `reservations:record-external` | `{ branchId, roomTypeId, stay, occupancy, guest, externalReference, channel?: string, amounts?: { nights[] } , notes? }` | `201 StaffReservationDto` | **Tx, Lock, Idem, Audit**; `409 INVENTORY_UNAVAILABLE` here is a cross-system conflict, so the UI shows the escalation procedure; `409 EXTERNAL_REFERENCE_EXISTS` |
| API-S5 | `PATCH /api/v1/staff/reservations/{id}` | `reservations:modify` | `If-Match`; `{ guest?: Partial<GuestInput>, internalNotes?, specialRequests? }` | `200 StaffReservationDto` | **Tx, Audit** (personal data redacted) |
| API-S6 | `PUT /api/v1/staff/reservations/{id}/stay` | `reservations:modify` | `If-Match`; `{ roomTypeId, stay, occupancy, acceptedTotal: Money, priceOverride? }` | `200 StaffReservationDto` | **Tx, Lock (old+new types), Audit**; `409 PRICE_CHANGED` if `acceptedTotal` differs from the re-quote (PR-11) |
| API-S7 | `POST /api/v1/staff/reservations/{id}/confirmation` | `reservations:decide` | `If-Match`; `{ checkedHotelSystem: true, note? }` | `200` | **Tx, Audit**; email |
| API-S8 | `POST /api/v1/staff/reservations/{id}/decline` | `reservations:decide` | `If-Match`; `{ reason: "NO_AVAILABILITY_IN_HOTEL_SYSTEM" \| "INVALID_DETAILS" \| "GUEST_REQUEST" \| "OTHER", note? }` | `200` | **Tx, Audit**; email |
| API-S9 | `POST /api/v1/staff/reservations/{id}/cancellation` | `reservations:cancel` | `If-Match`; `{ reason, note?, notifyGuest: boolean }` | `200` | **Tx, Audit** |
| API-S10 | `PUT /api/v1/staff/reservations/{id}/rooms/{lineId}/assignment` | `reservations:front-desk` | `If-Match`; `{ physicalRoomId \| null }` | `200` | **Tx, Audit**; `409 ROOM_ALREADY_ASSIGNED` / `ROOM_BLOCKED` |
| API-S11 | `POST /api/v1/staff/reservations/{id}/check-in` | `reservations:front-desk` | `If-Match` | `200` | Requires assignment and date ≥ check-in |
| API-S12 | `POST /api/v1/staff/reservations/{id}/check-out` | `reservations:front-desk` | `If-Match` | `200` | Shortens an early departure (IN-3) |
| API-S13 | `POST /api/v1/staff/reservations/{id}/no-show` | `reservations:front-desk` | `If-Match`; `{ note? }` | `200` | |
| API-S14 | `POST /api/v1/staff/reservations/{id}/manage-link` | `reservations:modify` | — | `202` | Rotates token, sends it by email and WhatsApp |
| API-S15 | `GET /api/v1/staff/reservations/{id}/history` | `reservations:read` | — | `200 { items: AuditEventDto[] }` | |

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
| API-S29 | `GET /api/v1/staff/branches/{branchId}/sync-status` | `reservations:read` | — | `200 { lastCompletedAt, lastCompletedBy, startedAt?, intervalMinutes, followUpMinutes, dueAt, due: boolean, serverTime }` | Polled by the staff shell every 60 seconds and on window focus; drives the sound and pop-up |

### Pricing

| Id | Method & path | Capability | Request | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| API-S30 | `GET /api/v1/staff/room-types/{roomTypeId}/rates?from&to` | `pricing:read` | — | `200 { baseRate: Money \| null, periods: RatePeriodDto[], calendar: NightPrice[] }` | |
| API-S31 | `PUT /api/v1/staff/room-types/{roomTypeId}/base-rate` | `pricing:manage` | `{ amount: Money }` | `200` | Audit before and after |
| API-S32 | `POST /api/v1/staff/room-types/{roomTypeId}/rate-periods` | `pricing:manage` | `{ kind, startDate, endDate, amount, label? }` | `201` | `409` same-kind overlap |
| API-S33 | `PATCH /api/v1/staff/rate-periods/{id}` | `pricing:manage` | partial | `200` | Audit |
| API-S34 | `DELETE /api/v1/staff/rate-periods/{id}` | `pricing:manage` | — | `204` | Sets `active=false`; snapshots unaffected |

### Guests

| Id | Method & path | Capability | Request | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| API-S50 | `GET /api/v1/staff/guests?q&blocked&page` | `guests:read` | `q` matches phone or name | `Paged<GuestListItem>` (phone, name, verified, blocked, reservation count in accessible branches) | |
| API-S51 | `GET /api/v1/staff/guests/{id}` | `guests:read` | — | `200 GuestDto` with reservations in accessible branches and block history | |
| API-S52 | `POST /api/v1/staff/guests/{id}/block` | `guests:block` | `{ reason: string }` | `200 GuestDto` | **Tx, Audit**; applies to all branches (Q-29); invalidates open verifications for the phone |
| API-S53 | `DELETE /api/v1/staff/guests/{id}/block` | `guests:block` | `{ reason: string }` | `200 GuestDto` | **Tx, Audit** |

### Reporting and audit

| Id | Method & path | Capability | Response | Notes |
| --- | --- | --- | --- | --- |
| API-S40 | `GET /api/v1/staff/reports/summary?branchId&from&to` | `reports:read` | counts by status and source, room-nights sold, occupancy %, revenue (priced only), average daily rate, unpriced count | Definitions in [functional-requirements.md](../requirements/functional-requirements.md#fr-rpt-reporting--planned-m10) |
| API-S41 | `GET /api/v1/staff/reports/occupancy?branchId&from&to&groupBy=day\|week\|month` | `reports:read` | series per room type | Range ≤ 366 days |
| API-S42 | `GET /api/v1/staff/reports/room-types?branchId&from&to` | `reports:read` | per room type: nights sold, occupancy, revenue, cancellations | "Room performance" (PDF section 10) |
| API-S43 | `GET /api/v1/staff/audit-events?branchId&entityType&entityId&actorId&from&to&page` | `audit:read` | `Paged<AuditEventDto>` | |

### Administration (Admin)

| Id | Method & path | Capability | Request | Notes |
| --- | --- | --- | --- | --- |
| API-A1 | `GET /api/v1/staff/branches` | `inventory:read` | — | Caller's branches (Admin: all) |
| API-A2 | `POST /api/v1/staff/branches` | `branches:manage` | `BranchInput` | Audit |
| API-A3 | `PATCH /api/v1/staff/branches/{id}` | `branches:manage` | partial `BranchInput` incl. `status`, `onlineBookingEnabled`, `syncReminderIntervalMinutes` (10–240), `syncFollowUpMinutes` (5–60, below the interval) | Audit; invalidates public cache tags |
| API-A4 | `PUT /api/v1/staff/users/{userId}/branches` | `users:manage` | `{ branchIds: string[] }` | Audit; only for Receptionist and Manager |

Room-type creation, editing, and publication stay in the existing CMS (Server Actions); they are not duplicated in the API. Moving a room type to another branch is not allowed once it has physical rooms or reservations.

## Transaction boundaries summary

| Operation | Transaction contents |
| --- | --- |
| Create (P7, S3, S4) | Idempotency check → lock → capacity/sold/rates → insert reservation, line, nights → audit → outbox |
| Transition (S7–S13, G2) | `SELECT … FOR UPDATE` reservation → version check → state machine → update status and `consumesInventory` → audit → outbox |
| Modify stay (S6) | Lock old and new types (sorted) → reservation `FOR UPDATE` → check → replace changed nights → audit |
| Block, unit deactivation (S23, S25, S26) | Lock unit's type → check sold versus new capacity → write → audit |
| Rate edits (S31–S34) | Write → audit (no inventory lock) |
