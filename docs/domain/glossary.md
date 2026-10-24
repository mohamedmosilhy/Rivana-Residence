# Glossary

Terms as used in code, documents, and conversation. When the CMS and reservation vocabularies differ, both are given.

| Term | Meaning |
| --- | --- |
| **Branch** | A hotel property operated by Rivana (today: New Cairo). It owns room types, physical rooms, prices, and reservations. Table `Branch`. |
| **Room type** | A sellable category of accommodation at one branch, such as "Studio with Balcony". In the CMS and the database this is the existing `Room` model; the code keeps that name. Guests book room types. |
| **Physical room** | A numbered unit, such as "204", belonging to one room type. Table `PhysicalRoom`. It is the unit of capacity. |
| **Capacity (night)** | The number of active physical rooms of a room type that are not blocked on a given night. |
| **Block** | A period during which one physical room cannot be sold (maintenance, owner use, other). Table `InventoryBlock`. A block is not a reservation. |
| **Stay** | The half-open date range `[checkIn, checkOut)`. Check-in is the first night; check-out is the departure day and is not a night. |
| **Night** | One calendar date inside a stay. A stay from the 10th to the 12th has two nights: the 10th and the 11th. |
| **Reservation** | A guest's booking at one branch, with one or more reservation room lines (v1: exactly one). Identified publicly by its reference. |
| **Reservation room line** | One room of one room type for the stay, optionally assigned to a physical room. Table `ReservationRoom`. It consumes one unit of capacity per night while the reservation is in an inventory-consuming status. |
| **Assignment** | Linking a reservation room line to a specific physical room, usually at confirmation or check-in. |
| **Reference** | A human-friendly, random, unique identifier such as `RR-7K3M9QX2`. Not a secret. |
| **Manage token** | A random secret delivered to the guest in a link by email and WhatsApp. Grants access to that one reservation (ADR 019). Only its hash is stored. |
| **Guest profile** | One record per verified phone number (`Guest`): latest name and email, verification time, block status, and the guest's reservations. Not an account; there is no password. |
| **Phone verification** | Proving a phone number with a 6-digit code sent by WhatsApp. Required for every online booking and for "My reservations". |
| **Blocked number** | A phone number blocked by a Manager or Admin. It cannot receive codes or book online at any branch. |
| **Source** | Where a reservation came from: `WEBSITE` (guest online), `STAFF` (phone, walk-in, or email taken by a receptionist), or `EXTERNAL` (already accepted by the hotel's operational system and recorded here by staff). |
| **PMS / hotel operational system** | The hotel's existing reservation and property-management software. It is not integrated; staff copy reservations by hand. |
| **Synchronization (manual)** | Staff work that makes Rivana and the PMS agree. It is not real-time and does not guarantee zero overbooking. |
| **Sync checkpoint** | A timestamped record that a receptionist has reconciled a branch with the PMS (`COMPLETED`), or has started doing so (`STARTED`). |
| **Sync reminder** | The sound and pop-up shown to a branch's receptionists when its last checkpoint is older than the sync interval (default 30 minutes), repeated after the follow-up delay (default 10 minutes) while a sync is in progress. |
| **Base rate** | A room type's default nightly price. |
| **Rate period** | A date range with a different nightly price for a room type: `SEASONAL` or `OFFER` (Q-06). |
| **Quote** | A per-night price breakdown and total computed by the server for a room type and stay. It is not stored until a reservation is created. |
| **Price snapshot** | The per-night amounts stored with a reservation at creation or explicit repricing (`ReservationNight`). |
| **Minor units** | Integer cents (1 USD = 100). All amounts are stored this way, in US dollars. |
| **Inventory-consuming status** | `PENDING`, `CONFIRMED`, `CHECKED_IN`, or `CHECKED_OUT`. The other statuses release inventory. |
| **Request to book** | A website reservation enters `PENDING` and holds inventory until staff confirm or decline it (Q-02). |
| **Idempotency key** | A client-chosen unique value sent with a create request, so retries do not create duplicates. |
| **Capability** | A named permission such as `reservations:decide`, granted to roles in `src/domain/auth/capabilities.ts`. |
| **Branch assignment** | The link between a Receptionist or Manager account and a branch they may operate. |
| **Promotion (CMS)** | The existing marketing popup with a code. It never calculates a discount; it differs from an `OFFER` rate period. |
