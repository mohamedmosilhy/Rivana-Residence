# 5. Database

## Exists today (prisma/schema.prisma, 6 migrations)
- Staff identity: `User`, `Session`, `Account`, `Verification`, `LoginThrottle`
- Branches: `Branch` (slug, status, time zone, contact, map URL, check-in/out, online-booking switch, sync settings), `StaffBranchAssignment`
- Content: `SiteSettings`, `SocialLink`, `Page` (HOME/ABOUT/CONTACT per branch), `PageSection` (typed JSON), `PageSectionMedia`
- Listings: `Room` (branchId, accommodationType), `RoomFeature`, `RoomMedia`, `Facility`, `FacilityMedia`
- `MediaAsset`, `ContactEnquiry`, `Promotion` (retired), `AuditEvent`
- `Branch` owns Page/Room/Facility/ContactEnquiry; deletes are RESTRICT.

## Conventions
CUID2 string ids; `timestamptz` UTC with `TimeZone=UTC` on every connection; stay dates are `DATE`; money integer cents + currency; rich text structured JSON; CHECK/exclusion/partial indexes in hand-written migration SQL; migrations additive; production `db:deploy` after backup; drift check via `prisma migrate diff`.

## Coming
| Milestone | Tables |
| --- | --- |
| M6 | `PhysicalRoom`, `InventoryBlock`, `RoomBaseRate`, `RatePeriod` |
| M7 | `ServiceOffering`, `Coupon`, `CouponBranch`, `CommercialSettings` |
| M8 | `Reservation`, `ReservationRoom`, `ReservationNight`, `ReservationService`, `CouponRedemption`, `Guest`, `PhoneVerification`, `NotificationOutbox`, `BranchSyncCheckpoint`, WhatsApp settings/templates |
| M9 | `Payment`, `PaymentEvent`, `CancellationRequest` |
`ReservationNight` = one row per unit per night, so counting sold is a GROUP BY and constraints can refuse overlaps.

## Preventing double booking (two layers, both PostgreSQL)
1. **Row lock on the listing**: availability-reducing operations start with `SELECT ... FOR NO KEY UPDATE`; the second request waits, recounts, sees 0 free, gets 409. Multiple listings locked in ascending id order (no deadlocks). No email/network/file I/O inside the transaction. `lock_timeout` 5s -> `503 TRY_AGAIN`.
2. **Exclusion constraints** (`btree_gist`): no overlapping assignments or blocks per physical room. Final safety net.

Also: idempotency key unique; `version` optimistic concurrency (412); outbox `FOR UPDATE SKIP LOCKED`; coupon row lock; unique provider event id; read paths take no locks (may be briefly stale, creation re-checks); coordination only in PostgreSQL, never memory.

## Booking transaction order
Replay by idempotency key -> consume phone verification -> lock listings (sorted) -> expire overdue holds -> check availability -> resolve nightly prices -> lock coupon -> compute quote -> compare `expectedTotalMinor` -> insert reservation/lines/nights/services/redemption/guest -> audit -> enqueue outbox. Commit, then dispatch messages and create the Paymob checkout. Domain classes decide; repository runs SQL.

## Proof plan
15 concurrency tests (C-1..C-15) on real PostgreSQL, ~20 iterations each, e.g. C-1 ten parallel bookings for the last room -> exactly 1 succeeds; C-3 back-to-back both succeed; C-11 coupon limit; C-12 late payment after resale; C-13 duplicate callbacks.

Read: `docs/database/integrity-and-concurrency.md`.
