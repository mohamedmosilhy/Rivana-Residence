# Glossary

Terms as used in code, documents, and conversation. When the CMS and reservation vocabularies differ, both are given.

| Term | Meaning |
| --- | --- |
| **Branch** | A hotel property operated by Rivana (today: New Cairo). It owns its website content (pages, facilities, listings, contact, map), physical units, prices, services, and reservations. Table `Branch`. |
| **Branch site** | The public pages of one branch at `/{branchSlug}/…`, rendered by shared templates from that branch's content. |
| **Branch chooser** | The first screen at `/` when two or more branches are active. With one active branch, `/` redirects to it. |
| **Accommodation listing** (room type or apartment type) | A sellable category of accommodation at one branch, such as "Studio with Balcony" or "Two-bedroom apartment". In the CMS and the database this is the existing `Room` model with `accommodationType` `ROOM` or `APARTMENT`; the code keeps the name `Room`. Guests book listings. "Room type" in older documents means the same thing. |
| **Hotel apartment** (شقق فندقية) | A listing with `accommodationType = APARTMENT`; booked, priced, and counted exactly like a room, but labelled as an apartment. |
| **Unit** (physical room or apartment) | A numbered unit, such as "204" or "A3", belonging to one listing. Table `PhysicalRoom`. It is the unit of capacity. |
| **Capacity (night)** | The number of active physical rooms of a room type that are not blocked on a given night. |
| **Block** | A period during which one physical room cannot be sold (maintenance, owner use, other). Table `InventoryBlock`. A block is not a reservation. |
| **Stay** | The half-open date range `[checkIn, checkOut)`. Check-in is the first night; check-out is the departure day and is not a night. |
| **Night** | One calendar date inside a stay. A stay from the 10th to the 12th has two nights: the 10th and the 11th. |
| **Reservation** | A guest's booking at one branch, with one or more reservation room lines for the same dates (Q-39). Identified publicly by its reference. |
| **Reservation room line** | One room of one room type for the stay, optionally assigned to a physical room. Table `ReservationRoom`. It consumes one unit of capacity per night while the reservation is in an inventory-consuming status. |
| **Assignment** | Linking a reservation room line to a specific physical room, usually at confirmation or check-in. |
| **Reference** | A human-friendly, random, unique identifier such as `RR-7K3M9QX2`. Not a secret. |
| **Manage token** | A random secret delivered to the guest in a link by email and WhatsApp. Grants access to that one reservation (ADR 019). Only its hash is stored. |
| **Guest profile** | One record per verified phone number (`Guest`): latest name and email, verification time, block status, and the guest's reservations. Not an account; there is no password. |
| **Phone verification** | Proving a phone number with a 6-digit code sent by WhatsApp. Required for every online booking and for "My reservations". |
| **Blocked number** | A phone number blocked by a Manager or Admin. It cannot receive codes or book online at any branch. |
| **Source** | Where a reservation came from: `WEBSITE` (guest online), `STAFF` (phone, walk-in, or email taken by a receptionist), or `EXTERNAL` (already accepted by the hotel's operational system and recorded here by staff). |
| **Immediate confirmation** | A website booking becomes `CONFIRMED` as soon as Rivana's database holds its inventory (pay at hotel) or a verified Paymob success arrives (online). It is not checked against the PMS (Q-36). |
| **Payment hold** | The `AWAITING_PAYMENT` state of an online booking: its units are held for about 15 minutes while the guest pays on Paymob. |
| **Entered in hotel system** | The marker (`pmsEnteredAt`) a receptionist sets after copying a website booking into the PMS (Q-40). |
| **Cancellation request** | A guest's request, made until 24 hours before check-in time, to cancel a confirmed booking; a Manager or Admin approves or rejects it (Q-38). |
| **Refund** | Money returned through Paymob's refund API for a paid booking whose cancellation was approved or that staff cancelled. |
| **PMS / hotel operational system** | The hotel's existing reservation and property-management software. It is not integrated; staff copy reservations by hand. |
| **Synchronization (manual)** | Staff work that makes Rivana and the PMS agree. It is not real-time and does not guarantee zero overbooking. |
| **Sync checkpoint** | A timestamped record that a receptionist has reconciled a branch with the PMS (`COMPLETED`), or has started doing so (`STARTED`). |
| **Sync reminder** | The sound and pop-up shown to a branch's receptionists when its last checkpoint is older than the sync interval (default 30 minutes), repeated after the follow-up delay (default 10 minutes) while a sync is in progress. |
| **Base rate** | A listing's default nightly price, before VAT. |
| **Date period** (rate period) | A date range with a different nightly price for a listing. One kind; periods of a listing never overlap (Q-44). The earlier `SEASONAL`/`OFFER` kinds are superseded. |
| **Optional service** | Breakfast or airport transportation, each a flat price per booking, added only when the guest chooses it (Q-49). |
| **Coupon** | A code (percentage or fixed USD amount) entered during booking that reduces the subtotal before VAT (Q-48). Not the retired promotion popup. |
| **VAT** | Value-added tax, one rate for all branches, calculated once on the taxable amount and shown separately at review (Q-45). |
| **Subtotal / taxable / total** | Subtotal = accommodation + services; taxable = subtotal − coupon discount; total = taxable + VAT (ADR 027). |
| **Quote** | The server-computed breakdown for a branch, stay, units, services, and coupon: nights per unit, services, discount, VAT, total. It is not stored until a reservation is created. |
| **Price snapshot** | Everything in the quote, stored immutably with a reservation at creation or explicit repricing. |
| **Minor units** | Integer cents (1 USD = 100). All amounts are stored this way, in US dollars. |
| **Inventory-consuming status** | `AWAITING_PAYMENT` (until its hold expires), `CONFIRMED`, `CHECKED_IN`, or `CHECKED_OUT`. The other statuses release inventory. |
| ~~**Request to book**~~ | Superseded (Q-02 → Q-36). Website reservations used to wait in `PENDING` for staff confirmation. |
| **Marketing opt-in** | A guest's recorded consent (time and wording version) to receive offers by WhatsApp; opt-out stops them (Q-58). |
| **Message template** | An Admin-managed record (`WhatsAppTemplate`) naming the Meta-approved WhatsApp template for one message purpose and language, with its variables mapped to booking fields (Q-67). |
| **Broadcast** | A WhatsApp marketing message sent by Rivana to opted-in guests of chosen branches, optionally with a coupon (Q-50). |
| **Idempotency key** | A client-chosen unique value sent with a create request, so retries do not create duplicates. |
| **Capability** | A named permission such as `cancellations:decide`, granted to roles in `src/domain/auth/capabilities.ts`. |
| **Branch assignment** | The link between a Receptionist or Manager account and a branch they may operate. |
| **Promotion (CMS)** | The implemented marketing popup with a code. It never calculates a discount. Retired by Q-47; removed in M5. |
