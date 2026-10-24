# Module boundaries

Status: **Planned**, design accepted 2026-10-24 (ADR 015). Modules marked *(implemented)* exist today; the rest are planned.

| Module | Responsibility | Owns (tables) | Public interface (application) | May depend on |
| --- | --- | --- | --- | --- |
| Identity & access *(implemented, extended)* | Staff sessions, roles, capabilities, branch assignments | `User`, `Session`, `Account`, `Verification`, `LoginThrottle`, `StaffBranchAssignment` | `getCurrentStaff`, `authorize`, `authorizeBranch`, staff directory, `AssignStaffBranches` | Branches (ids only) |
| Content / CMS *(implemented)* | Pages, rooms (marketing), facilities, media, promotions, settings, enquiries | Existing content tables, including `Room` | Existing catalog/page/media/promotion use cases; **new** read-only `RoomTypeCatalog` port implementation for reservations | Branches (room's branch) |
| Branches | Branch identity, status, online-booking switch, contact | `Branch` | `ListBranches`, `GetBranch`, `ManageBranches` | Identity (authorization) |
| Inventory | Physical rooms, blocks, capacity per night | `PhysicalRoom`, `InventoryBlock` | `ManagePhysicalRooms`, `CreateBlock`, `CancelBlock`, capacity read model | Branches, CMS `RoomTypeCatalog` |
| Pricing | Base rates, rate periods, quotes | `RoomBaseRate`, `RatePeriod` | `QuoteStay`, `ManageRates`, `PriceResolver` (domain) | CMS `RoomTypeCatalog` |
| Reservations | Reservation lifecycle, allocation, guest access, idempotency, the booking transaction, sync checkpoints | `Reservation`, `ReservationRoom`, `ReservationNight`, `BranchSyncCheckpoint` | Use cases in [domain/domain-model.md](../domain/domain-model.md#use-cases) | Branches, Inventory, Pricing, Audit, Notifications, Identity |
| Guests | Verified phone profiles, phone verification codes, blocking | `Guest`, `PhoneVerification` | `RequestPhoneVerification`, `ConfirmPhoneVerification`, `SearchGuests`, `BlockGuestPhone`, `UnblockGuestPhone`; `GuestRepository` port used by Reservations | Identity (authorization), Notifications (`WhatsAppSender`) |
| Reporting | Read-only statistics | none | `GetReports` | Reads reservation and inventory data through its own read model |
| Audit | Append-only management history | `AuditEvent` | `AuditLog.append` (inside a unit of work), `ListAuditEvents` | none |
| Notifications | Email and WhatsApp templates, outbox, dispatch | `NotificationOutbox` | `NotificationOutbox.enqueue`, `DispatchOutbox` job, `WhatsAppSender` | Existing SMTP configuration; WhatsApp provider adapter |
| Hotel system sync | Future PMS integration | none | `HotelSystemSync` port, no adapter | Reservations (domain types) |

## Rules

- A module's tables are written only by that module's repositories. The **booking unit of work** is the one deliberate exception: it is owned by Reservations, but binds the Inventory, Pricing, Audit, and Notifications ports to one transaction. It may only *read* inventory and pricing data, and *append* audit and outbox rows.
- Cross-module reads go through ports (`RoomTypeCatalog`, `InventoryReader`, `RateRepository`), not shared Prisma queries in another module's repository.
- Reporting is the only module allowed broad read-only SQL over other modules' tables, because it has no business rules of its own. Its queries live in one read-model file per report.
- CMS publication state is respected by reservations (IN-4). Reservations never write CMS tables.
- No module imports another module's `infrastructure`.
