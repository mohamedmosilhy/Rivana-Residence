# Module boundaries

Status: **Partly implemented**, design accepted 2026-10-24 (ADR 015), extended 2026-11-06 (ADRs 024–028). Modules marked *(implemented)* exist today; the rest are planned.

**M6 implemented portions:** T2 added the pure `AvailabilityCalculator`, `checkInventoryReduction`, and `NightlyPriceResolver` exports. T3 added the inventory and rate tables. T4 added reservation unit of work and inventory ports, `InventoryGuard`, and transaction bound Prisma adapters for listing locks, capacity reads, and the intentionally empty M6 reservation consumption source. T5 and T6 added the unit and block writers. T7 added `PrismaRateRepository`, `ManageRates`, `GetRateCalendar`, composition, and the rate endpoints S30 to S34. Availability queries and the remaining pricing repositories remain planned. See the [M6 report](../delivery/reports/m6-inventory-and-availability.md).

| Module | Responsibility | Owns (tables) | Public interface (application) | May depend on |
| --- | --- | --- | --- | --- |
| Identity & access *(implemented, extended)* | Staff sessions, roles, capabilities, branch assignments | `User`, `Session`, `Account`, `Verification`, `LoginThrottle`, `StaffBranchAssignment` | `getCurrentStaff`, `authorize`, `authorizeBranch`, staff directory, `AssignStaffBranches` | Branches (ids only) |
| Content / CMS *(implemented)* | Branch pages, listings (marketing; rooms and apartments), facilities, media, brand settings, enquiries (promotions removed in M5) | Existing content tables, including `Room` | Existing catalog/page/media use cases, plus branch administration (M5); **new** read-only `RoomTypeCatalog` port implementation for reservations | Branches (room's branch) |
| Branches | Branch identity, status, online-booking switch, contact, map, check-in time; chooser and switcher data | `Branch` | `ListBranches`, `GetBranch`, `ManageBranches` | Identity (authorization) |
| Inventory | Physical rooms, blocks, capacity per night | `PhysicalRoom`, `InventoryBlock` | `ManagePhysicalRooms` (M6-T5, implemented), `ManageBlocks` (create, update, cancel; M6-T6, implemented), capacity read model | Branches, CMS `RoomTypeCatalog` |
| Pricing | Base rates, date periods, optional services, coupons, VAT, quotes | `RoomBaseRate`, `RatePeriod`, `ServiceOffering`, `Coupon`, `CouponBranch`, `CommercialSettings` | `QuoteBooking`, `ManageRates` and `GetRateCalendar` (M6-T7, implemented), `ManageServices`, `ManageCoupons`, `ManageCommercialSettings`; `NightlyPriceResolver`, `CouponPolicy`, `QuoteCalculator` (domain) | CMS `RoomTypeCatalog`, Branches |
| Reservations | Reservation lifecycle (immediate confirmation), allocation, guest access, cancellation requests, PMS-entry marker, idempotency, the booking transaction, sync checkpoints | `Reservation`, `ReservationRoom`, `ReservationNight`, `ReservationService`, `CouponRedemption`, `CancellationRequest`, `BranchSyncCheckpoint` | Use cases in [domain/domain-model.md](../domain/domain-model.md#use-cases) | Branches, Inventory, Pricing, Audit, Notifications, Identity |
| Payments | Paymob checkout, callbacks, holds, reconciliation, refunds | `Payment`, `PaymentEvent` | `ProcessPaymentCallback`, `ReconcilePayments`, `RetryRefund`; `PaymentGateway` port used by Reservations | Reservations (status changes through its use cases), Audit, Notifications |
| Marketing | Consent, broadcasts, feedback requests | `Broadcast` (consent columns live on `Guest`) | `PreviewBroadcastAudience`, `SendBroadcast`, `RecordOptOut` | Guests, Notifications, Pricing (coupon reference), Identity |
| Guests | Verified phone profiles, phone verification codes, blocking, marketing consent | `Guest`, `PhoneVerification` | `RequestPhoneVerification`, `ConfirmPhoneVerification`, `SearchGuests`, `BlockGuestPhone`, `UnblockGuestPhone`; `GuestRepository` port used by Reservations | Identity (authorization), Notifications (`WhatsAppSender`) |
| Reporting | Read-only statistics | none | `GetReports` | Reads reservation and inventory data through its own read model |
| Audit | Append-only management history | `AuditEvent` | `AuditLog.append` (inside a unit of work), `ListAuditEvents` | none |
| Notifications | Email and WhatsApp templates, outbox, dispatch | `NotificationOutbox` | `NotificationOutbox.enqueue`, `DispatchOutbox` job, `WhatsAppSender` | Existing SMTP configuration; WhatsApp provider adapter |
| Hotel system sync | Future PMS integration | none | `HotelSystemSync` port, no adapter | Reservations (domain types) |

## Rules

- A module's tables are written only by that module's repositories. The **booking unit of work** is the one deliberate exception: it is owned by Reservations, but binds the Inventory, Pricing, Payments, Audit, and Notifications ports to one transaction. It may only *read* inventory and pricing data, *lock* the coupon row and *insert* the redemption, create the `Payment` row, and *append* audit and outbox rows.
- Cross-module reads go through ports (`RoomTypeCatalog`, `InventoryReader`, `RateRepository`), not shared Prisma queries in another module's repository.
- Reporting is the only module allowed broad read-only SQL over other modules' tables, because it has no business rules of its own. Its queries live in one read-model file per report.
- CMS publication state is respected by reservations (IN-4). Reservations never write CMS tables.
- No module imports another module's `infrastructure`.
