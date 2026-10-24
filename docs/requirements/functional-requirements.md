# Functional requirements

Requirement IDs are referenced from the [traceability matrix](./scope-traceability-matrix.md). Business rules (AV-, OC-, IN-, PR-) are defined in [../domain/availability-and-pricing-rules.md](../domain/availability-and-pricing-rules.md). The full route list is in [../frontend/route-map.md](../frontend/route-map.md).

Each section states its status: **Implemented** (built and accepted in Phases 1–10) or **Planned** (with its milestone in the [roadmap](../delivery/roadmap.md)).

## FR-WEB Public website — Implemented

- **FR-WEB-1** Pages: Home, About, Rooms, room detail, Facilities, facility detail (Gym, Swimming Pool), Contact. Navigation may link Gym and Swimming Pool directly, and `/facilities` stays the complete index. Unknown or unpublished slugs return a real 404 and are left out of navigation and the sitemap.
- **FR-WEB-2** A brand-led responsive header, footer, mobile navigation, and clear page hierarchy.
- **FR-WEB-3** Editorial Home and About content managed from the CMS.
- **FR-WEB-4** Room listing and detail pages with occupancy, size, bed and view summaries, features, and galleries.
- **FR-WEB-5** Facility listing and detail pages with descriptions, galleries, and optional opening-hours text.
- **FR-WEB-6** Configurable contact details, map link or embed, social links, and a contact form.
- **FR-WEB-7** Optimized responsive media with meaningful alt text.
- **FR-WEB-8** An accessible promotion popup for the active campaign, with a copy-code action, terms, and dismissal.
- **FR-WEB-9** Per-page SEO metadata, canonical URLs, structured data, and social share images.
- **FR-WEB-10** Book Now controls on the header, room cards, and room pages. When the room's branch takes online bookings they open the booking journey (FR-CAT-3, planned M8). Otherwise they stay an honest, accessible disabled control that explains how to book (implemented).

## FR-CMS Content management — Implemented

- **FR-CMS-1** Closed staff authentication; no public sign-up.
- **FR-CMS-2** Edit global identity, logos, contact details, social links, footer text, default SEO, and map configuration.
- **FR-CMS-3** Edit a controlled set of page sections ([../domain/content-model.md](../domain/content-model.md)) without arbitrary layout construction.
- **FR-CMS-4** Create, update, order, feature, publish or unpublish, and archive or delete rooms and facilities.
- **FR-CMS-5** Upload, replace, search, inspect usage of, and safely delete media. Set alt text, focal point, and optional caption or credit. Track image rights.
- **FR-CMS-6** Create, schedule, publish or unpublish, prioritize, and archive promotion campaigns ([../domain/promotions.md](../domain/promotions.md)).
- **FR-CMS-7** View and archive contact enquiries.
- **FR-CMS-8** Validate input with field-level feedback, confirm destructive actions, and block deletion of referenced media.
- **FR-CMS-9** Preview or open the public page for editable content.
- **FR-CMS-10** Manage staff accounts and sessions (Admin), and one's own password and sessions (everyone).

## FR-CNT Content readiness — Implemented (tooling), ongoing (content)

- **FR-CNT-1** Supplied text and images are draft inputs, not approved production content.
- **FR-CNT-2** Room facts and opening hours are verified with the client. Each room type gets its own approved gallery.
- **FR-CNT-3** Placeholder amenity text and stock-looking imagery are replaced unless ownership or licensing is confirmed. Credits are kept where a license requires them.
- **FR-CNT-4** Phone, email, address, map coordinates, social URLs, legal links, and copyright owner are confirmed before launch (`npm run audit:content` checks them).

## FR-BR Branches — Planned (M5, UI M10)

- **FR-BR-1** Admin creates, edits, activates, and deactivates branches with the attributes in [branch-model.md](../domain/branch-model.md), including the sync reminder interval (default 30 minutes) and follow-up delay (default 10 minutes).
- **FR-BR-2** Public branch listing shows only `ACTIVE` branches. The branch selector is shown only when more than one branch is active.
- **FR-BR-3** Each branch has an `onlineBookingEnabled` switch. When it is off, Book Now for that branch keeps the honest disabled state (FR-WEB-10).
- **FR-BR-4** Deactivation hides the branch publicly, blocks new reservations, and keeps history manageable (branch model, "Deactivation").

## FR-CAT Room catalog — Planned (M4–M5)

- **FR-CAT-1** Each room type (the CMS `Room`) belongs to exactly one branch, chosen when it is created. It can be changed only while it has no physical rooms or reservations.
- **FR-CAT-2** Room listing and detail pages show the room type's branch. `/rooms` can be filtered by branch when more than one is active.
- **FR-CAT-3** Book Now on a room page opens the booking journey for that room type and branch (IN-4 decides whether it is enabled).

## FR-INV Inventory — Planned (M5–M6, UI M9)

- **FR-INV-1** Manager and Admin add, rename, and deactivate physical rooms per room type (unique label per branch).
- **FR-INV-2** Receptionist and above create, shorten, extend, and cancel blocks on a physical room with a reason (IN-6, IN-7).
- **FR-INV-3** Staff see an availability grid per branch: room types by nights, showing capacity, sold, free, and blocked, for up to 62 nights.

## FR-AV Availability search — Planned (M6, UI M8)

- **FR-AV-1** Guests search a branch by check-in, check-out, adults, and children (AV-1…9, OC-1…3).
- **FR-AV-2** Results list eligible published room types with availability and, when available, the total and per-night breakdown.
- **FR-AV-3** Unavailable room types show a reason: sold out, too many guests, or no price.
- **FR-AV-4** Results are computed server-side for every request and never cached.

## FR-PR Pricing — Planned (M6, UI M10)

- **FR-PR-1** Manager and Admin set a base nightly rate per room type.
- **FR-PR-2** Manager and Admin create, edit, and deactivate seasonal and offer periods (PR-2…4).
- **FR-PR-3** The system prices each night by PR-3 and shows the breakdown before submission.
- **FR-PR-4** Reservations store a per-night price snapshot (PR-8).
- **FR-PR-5** Manager and Admin may override nightly prices on a reservation with a reason (PR-10).
- **FR-PR-6** A staff rate calendar shows the effective price per night.

## FR-RES Reservations — Planned (M7, UI M8–M9)

- **FR-RES-1** A guest submits a reservation request with a verified phone (FR-GST-1), name, email, consent to the privacy notice, and the quoted total. It is created `PENDING` with a reference and linked to the guest profile (Q-02, decided).
- **FR-RES-2** The guest sees an on-screen result and receives an email and a WhatsApp message with the reference, the details, the status "request received", and the manage link.
- **FR-RES-3** Receptionist and above create reservations for guests (phone, walk-in, email), which start `CONFIRMED`.
- **FR-RES-4** Receptionist and above record reservations that exist in the hotel system (`EXTERNAL`), with the external reference. A conflict with Rivana's inventory is reported clearly.
- **FR-RES-5** Staff confirm or decline pending requests. Confirmation requires attesting that the hotel system was checked; decline requires a reason. The guest gets an email and a WhatsApp message either way.
- **FR-RES-6** Staff modify guest details and notes, and modify dates, room type, or occupancy with an inventory re-check and an explicit re-quote (PR-11).
- **FR-RES-7** Staff cancel reservations with a reason. Guests cancel only `PENDING` requests through the manage link (Q-07). For `CONFIRMED` ones they are shown the hotel's contact details.
- **FR-RES-8** Staff assign a physical room, check in, check out (early departure shortens the stay), and mark no-show, following [reservation-lifecycle.md](../domain/reservation-lifecycle.md).
- **FR-RES-9** Creation is idempotent and conflict-safe (lifecycle "Idempotency"; ADR 016).
- **FR-RES-10** References are unique, random, and human-friendly.

## FR-GST Guest verification and profiles — Planned (M7, UI M8–M9)

- **FR-GST-1** Before submitting, the guest verifies their phone with a 6-digit code sent by WhatsApp (valid 10 minutes, 5 attempts, rate-limited). The verification is valid for 30 minutes and one reservation (Q-27, Q-28).
- **FR-GST-2** Rivana keeps one guest profile per verified phone number: phone, latest name and email, verification time, block status, and reservations. Staff-created and external reservations link to the profile with the same number, or create an unverified one.
- **FR-GST-3** Staff with `guests:read` search guest profiles by phone or name and see their reservations (within the branches they can access).
- **FR-GST-4** Admin and Manager block or unblock a phone number with a reason (Q-29). A blocked number receives no codes and cannot book online at any branch; the guest is asked to contact the hotel. Existing reservations are not changed automatically.
- **FR-GST-5** Guest data is kept indefinitely (Q-13).

## FR-LKP Guest access — Planned (M7, UI M8)

- **FR-LKP-1** A guest opens the manage link (sent by email and WhatsApp) to view their reservation and its allowed actions.
- **FR-LKP-2** A guest enters their phone number, receives a WhatsApp code, and then sees all reservations of that number ("My reservations"), for 30 minutes.
- **FR-LKP-3** Staff can resend or rotate a guest's manage link.

## FR-OPS Front-desk operations — Planned (M9)

- **FR-OPS-1** Dashboard per branch: today's arrivals and departures, in-house guests, pending requests with their age, and the latest sync checkpoint with the time the next one is due.
- **FR-OPS-2** Reservation list with filters (status, source, dates, search) and pagination.
- **FR-OPS-3** Reservation detail with history (audit), price snapshot, assignment, and the actions allowed for this user.
- **FR-OPS-4** Manual reservation and external-reservation entry forms that prevent double submission.
- **FR-OPS-5** Record a sync checkpoint for the branch, with an optional note (for example "2 external reservations added"). One checkpoint counts for the whole branch.
- **FR-OPS-6** Sync reminder (Q-20): when a branch's last checkpoint is older than its interval (default 30 minutes), every signed-in receptionist of that branch hears a sound and sees a pop-up that cannot be dismissed without an answer: **"I have synced"** records a checkpoint; **"I'm syncing now"** records that a sync started and reminds again after the follow-up delay (default 10 minutes). If several staff are signed in, the first answer clears the reminder for everyone at that branch. Managers see overdue branches and the checkpoint history.

## FR-RPT Reporting — Planned (M10)

Definitions, all per branch and date range, with nights counted by stay night:

- **Reservations created**: count by status and source, by creation date.
- **Room-nights sold**: nights of inventory-consuming lines (`CHECKED_OUT` counts only nights actually stayed).
- **Room-nights available**: Σ nights × capacity (active, unblocked units).
- **Occupancy %**: sold ÷ available.
- **Revenue (recorded)**: Σ snapshot amounts of `CONFIRMED`, `CHECKED_IN`, and `CHECKED_OUT` nights. Reservations with no price (some `EXTERNAL`) are excluded and counted separately. It is labelled "recorded prices, not payments".
- **ADR (average daily rate)**: revenue ÷ priced sold nights.
- **Cancellation rate**: cancelled ÷ created, and declined ÷ website requests.

Requirements:

- **FR-RPT-1** Manager and Admin view summary, occupancy trend (day, week, month), and room-type performance for their branches.
- **FR-RPT-2** Every figure states its definition and data limitations, for example "external reservations without prices excluded".
- **FR-RPT-3** Statistics are shown on screen only. There is no CSV export; the hotel's operational system provides exports (Q-14).

## FR-IAM Identity and access — Implemented for Editor and Admin; Planned for new roles (M4, UI M10)

- **FR-IAM-1** Admin creates staff with roles Editor (content only), Receptionist, Manager, or Admin.
- **FR-IAM-2** Admin assigns Receptionist and Manager accounts to branches.
- **FR-IAM-3** Each capability is enforced server-side, with branch scope for reservation data ([user-roles-and-permissions.md](./user-roles-and-permissions.md)).

## FR-AUD Audit — Planned (M4 table, M7 onward)

- **FR-AUD-1** Every reservation, inventory, pricing, branch, guest-block, sync-checkpoint, and staff-access mutation appends an audit event (actor, action, entity, branch, reason, redacted changes, time). Content edits keep `updatedById` (Q-15).
- **FR-AUD-2** Reservation detail shows its history. Manager and Admin search the audit log.
- **FR-AUD-3** Audit events cannot be edited or deleted through the application.

## FR-NTF Notifications — Planned (M7)

- **FR-NTF-1** Guest messages by email and WhatsApp (Q-32): request received, confirmed, declined, cancelled, and manage link (resend). Email uses plain-text and simple HTML templates; WhatsApp uses Meta-approved templates. English first (Arabic: Q-10). Verification codes go by WhatsApp only.
- **FR-NTF-2** Staff alert email to a branch inbox on a new website request (address: Q-10).
- **FR-NTF-3** Messages are queued in the outbox per channel inside the transaction and retried. A failure never rolls back the reservation and is visible on reservation detail. Contact-form email delivery (implemented) keeps its own enquiry status.
