# Functional requirements

Requirement IDs are referenced from the [traceability matrix](./scope-traceability-matrix.md). Business rules (AV-, OC-, IN-, PR-, SV-, CP-, TX-, PY-, CX-) are defined in [../domain/availability-and-pricing-rules.md](../domain/availability-and-pricing-rules.md) and [../domain/reservation-lifecycle.md](../domain/reservation-lifecycle.md). The full route list is in [../frontend/route-map.md](../frontend/route-map.md).

Each section states its status: **Implemented** (built and accepted in Phases 1–11) or **Planned** (with its milestone in the [roadmap](../delivery/roadmap.md#reservation-milestones)). The client decisions of 2026-11-06 ([Q-36…Q-53](./assumptions-and-open-questions.md#decided-2026-11-06-client-decisions)) are reflected throughout; nothing they introduce is implemented yet.

## FR-WEB Public website — Implemented (single-site form); moving to branch sites in M5

- **FR-WEB-1** Pages: Home, About, accommodation listing and detail, Facilities, facility detail, Contact. Unknown or unpublished slugs return a real 404 and are left out of navigation and the sitemap. *Implemented at unprefixed URLs; they move under `/{branch}/…` in M5 (FR-SITE).*
- **FR-WEB-2** A brand-led responsive header, footer, mobile navigation, and clear page hierarchy.
- **FR-WEB-3** Editorial Home and About content managed from the CMS.
- **FR-WEB-4** Listing and detail pages with occupancy, size, bed and view summaries, features, and galleries.
- **FR-WEB-5** Facility listing and detail pages with descriptions, galleries, and optional opening-hours text.
- **FR-WEB-6** Configurable contact details, map, social links, and a contact form.
- **FR-WEB-7** Optimized responsive media with meaningful alt text.
- **FR-WEB-8** ~~An accessible promotion popup for the active campaign~~. **Retired by Q-47 (2026-11-06).** The popup is implemented and accepted (Phase 7) and is removed in M5.
- **FR-WEB-9** Per-page SEO metadata, canonical URLs, structured data, and social share images.
- **FR-WEB-10** Book Now controls on the header, listing cards, and detail pages. When the branch takes online bookings they open that branch's booking journey (planned M10). Otherwise they stay an honest, accessible disabled control that explains how to book (implemented).

## FR-SITE Branch websites — Planned (data M4, site M5)

- **FR-SITE-1** Every page, facility, and accommodation listing belongs to one branch. Brand identity (logo, brand name, social links, footer and legal text, default SEO) stays shared (Q-42).
- **FR-SITE-2** With two or more `ACTIVE` branches, `/` shows a branch chooser as the visitor's first screen. With one, `/` redirects to that branch's site (Q-41).
- **FR-SITE-3** Branch pages live at `/{branchSlug}/…` and render the branch's own text and images through shared templates. There is no per-branch implementation or design.
- **FR-SITE-4** Visitors switch branches from the header; switching keeps the page type when the target exists, otherwise opens the other branch's listing or home.
- **FR-SITE-5** The chosen branch is carried through listings, Book Now, and the booking journey; booking never mixes branches.
- **FR-SITE-6** Existing URLs (`/about`, `/contact`, `/rooms…`, `/facilities…`, legacy `*.html`) redirect permanently to the first branch's equivalents.
- **FR-SITE-7** Each branch's Contact page and home location section show its location as an interactive Google Map embed (allowlisted `google.com/maps/embed` URL), with the address and a directions link always available (Q-52).
- **FR-SITE-8** Sitemap, canonical URLs, and structured data are generated per branch; inactive branches are excluded.

## FR-CMS Content management — Implemented (branch selector since M5)

- **FR-CMS-1** Closed staff authentication; no public sign-up.
- **FR-CMS-2** Edit brand identity, logos, social links, footer text, and default SEO. Contact details and the map move to the branch (M5).
- **FR-CMS-3** Edit a controlled set of page sections ([../domain/content-model.md](../domain/content-model.md)) without arbitrary layout construction, per branch (M5).
- **FR-CMS-4** Create, update, order, feature, publish or unpublish, and archive or delete accommodation listings and facilities, per branch (M5).
- **FR-CMS-5** Upload, replace, search, inspect usage of, and safely delete media. Set alt text, focal point, and optional caption or credit. Track image rights.
- **FR-CMS-6** ~~Create, schedule, publish, prioritize, and archive promotion campaigns~~. **Retired by Q-47.** Implemented in Phase 5; removed in M5. Coupons (FR-CPN) replace it.
- **FR-CMS-7** View and archive contact enquiries; enquiries record the branch whose contact page sent them (M5).
- **FR-CMS-8** Validate input with field-level feedback, confirm destructive actions, and block deletion of referenced media.
- **FR-CMS-9** Preview or open the public page for editable content.
- **FR-CMS-10** Manage staff accounts and sessions (Admin), and one's own password and sessions (everyone).
- **FR-CMS-11** Editors and Admins choose the branch whose content they edit; Editors have no branch restriction (Q-01). Managers and Receptionists do not edit content.

## FR-CNT Content readiness — Implemented (tooling), ongoing (content)

- **FR-CNT-1** Supplied text and images are draft inputs, not approved production content.
- **FR-CNT-2** Listing facts and opening hours are verified with the client. Each listing gets its own approved gallery.
- **FR-CNT-3** Placeholder amenity text and stock-looking imagery are replaced unless ownership or licensing is confirmed.
- **FR-CNT-4** Phone, email, address, map, social URLs, legal links, and copyright owner are confirmed before launch, per branch from M5 (`npm run audit:content` checks them).

## FR-BR Branches — Planned (M4 data, M5 API and minimal form, M12 full admin)

- **FR-BR-1** Admin creates, edits, activates, and deactivates branches with the attributes in [branch-model.md](../domain/branch-model.md): content owner, contact, address, map embed, check-in and check-out times, sync reminder settings.
- **FR-BR-2** Public branch listing shows only `ACTIVE` branches.
- **FR-BR-3** Each branch has an `onlineBookingEnabled` switch. When it is off, Book Now keeps the honest disabled state. It cannot be turned on while the VAT rate is unset (FR-TAX-1) or WhatsApp is not configured (FR-NTF-5).
- **FR-BR-4** Deactivation hides the branch publicly, blocks new reservations, and keeps history manageable.

## FR-CAT Accommodation catalog — Planned (M4 columns, M5)

- **FR-CAT-1** Each listing (the CMS `Room`) belongs to exactly one branch, chosen when it is created. It can be moved only while it has no units or reservations.
- **FR-CAT-2** Staff mark each listing `ROOM` or `APARTMENT`; apartments may record bedrooms and bathrooms (Q-43).
- **FR-CAT-3** Guest-facing labels describe both kinds honestly: "Rooms & Apartments", or only "Rooms" or "Apartments" when a branch offers one kind; a Room or Apartment badge on cards and details; listing URLs `/{branch}/stay/{slug}`.
- **FR-CAT-4** Each listing has its own description, images, capacity (adults, children), features, and price (FR-PR).
- **FR-CAT-5** Book Now on a listing opens the booking journey for that branch with the listing preselected (IN-4 decides whether it is enabled).

## FR-INV Inventory — Planned (M6, UI M11)

- **FR-INV-1** Manager and Admin add, rename, and deactivate physical units (room or apartment numbers) per listing (unique label per branch).
- **FR-INV-2** Receptionist and above create, shorten, extend, and cancel blocks on a unit with a reason (IN-6, IN-7).
- **FR-INV-3** Staff see an availability grid per branch: listings by nights, showing capacity, sold, free, and blocked, for up to 62 nights.

## FR-AV Availability search — Planned (M6, UI M10)

- **FR-AV-1** Guests search a branch by check-in, check-out, adults, and children (AV-1…9, OC-1…3).
- **FR-AV-2** Results list only the branch's published listings that are available for those dates and that party, with the accommodation price **before VAT**, and how many units can still be added to the booking.
- **FR-AV-3** Unavailable listings show a reason: sold out, too many guests, or no price.
- **FR-AV-4** Results are computed server-side for every request and never cached.

## FR-PR Prices and quote — Planned (M6 rates, M7 quote, UI M12)

- **FR-PR-1** Manager and Admin set a base nightly price per listing, in USD.
- **FR-PR-2** Manager and Admin create, edit, and deactivate date periods with a different nightly price; periods for one listing never overlap (PR-2…4, Q-44).
- **FR-PR-3** The server builds every quote in one order: accommodation, plus chosen services, minus the coupon, then VAT on the result (ADR 027). Selection shows prices before VAT; the final review shows VAT separately and includes it in the total.
- **FR-PR-4** Reservations store an immutable price snapshot: per-night amounts per unit, service lines, coupon, discount, VAT rate and amount, and total (PR-8).
- **FR-PR-5** Manager and Admin may override nightly prices on a staff reservation with a reason (PR-10).
- **FR-PR-6** A staff rate calendar shows the effective price per night.

## FR-SVC Optional services — Planned (M7, UI M10 and M12)

- **FR-SVC-1** Each branch may offer breakfast and airport transportation, each with a flat price per booking and an on or off switch, managed by Manager (assigned branches) and Admin (Q-49).
- **FR-SVC-2** Guests may choose services while booking. The final review may offer unchosen services as an optional cross-sell. A service is never added without the guest's explicit choice.
- **FR-SVC-3** Chosen services are part of the subtotal, the coupon base, and the VAT base (ADR 027).
- **FR-SVC-4** Approved prices, transfer details (flight number, direction), and post-booking additions are open (Q-56).

## FR-CPN Coupons — Planned (M7, redemption M8, UI M10 and M12)

- **FR-CPN-1** Admin, and Managers for codes limited to their branches, create, edit, activate, and deactivate coupon codes (Q-48).
- **FR-CPN-2** A coupon is a percentage or a fixed USD amount; it may have validity dates, a total redemption limit, and a per-phone limit; it is valid at selected branches or all branches.
- **FR-CPN-3** Guests enter one code per booking; the server validates it in the quote and again in the booking transaction and explains a refusal (CP-1…3).
- **FR-CPN-4** The discount applies to the whole booking subtotal (accommodation and services) before VAT; a fixed amount never makes the total negative.
- **FR-CPN-5** Each use is recorded as a redemption with the reservation; limits hold under concurrent bookings. Release on cancellation follows Q-57.
- **FR-CPN-6** Coupon changes and redemptions are audited. Codes are distributed by WhatsApp broadcasts (FR-MKT), not on the website.

## FR-TAX VAT — Planned (M7, UI M10 and M12)

- **FR-TAX-1** Only the Admin sets the VAT percentage, one for all branches, on an Admin-only setting in the dashboard, and may change it at any time (for example 5%, 6%, or 15%; Q-05, Q-45). Until a rate is entered, online booking cannot be enabled. Guests see the line labelled "VAT (n%)".
- **FR-TAX-2** VAT is calculated once on the final subtotal after services and the coupon, rounded half-up to the cent, and shown as a separate line at the final review and in confirmations.
- **FR-TAX-3** Each reservation stores the rate and amount it used; later rate changes never alter it.

## FR-RES Reservations — Planned (M8, online payment M9, UI M10–M11)

- **FR-RES-1** A guest submits a booking for one branch: one or more units (same dates, Q-39), occupancy per unit, verified phone (FR-GST-1), name, email, privacy consent, optional services and coupon, payment choice (Paymob or pay at hotel), and the quoted total. A pay-at-hotel booking is created **`CONFIRMED`** in the transaction that reserves its inventory. An online-payment booking is `AWAITING_PAYMENT` and becomes `CONFIRMED` only when Paymob's verified success arrives (Q-36, Q-37).
- **FR-RES-2** The guest sees an on-screen result. Only a `CONFIRMED` booking is shown or messaged as confirmed: email and WhatsApp confirmations with the reference, details, price breakdown with VAT, payment method, cancellation terms, and the manage link, sent after commit (Q-53).
- **FR-RES-3** Receptionist and above create reservations for guests (phone, walk-in, email), which start `CONFIRMED` and are paid at the hotel.
- **FR-RES-4** Receptionist and above record reservations that exist in the hotel system (`EXTERNAL`), with the external reference. A conflict with Rivana's inventory is reported clearly.
- **FR-RES-5** Staff mark each website reservation as entered in the hotel system; until then it is flagged and its age is shown (Q-40).
- **FR-RES-6** Staff modify guest details and notes, and modify dates, units, or occupancy with an inventory re-check and an explicit re-quote (PR-11). Total changes on prepaid bookings follow Q-66.
- **FR-RES-7** Staff cancel reservations with a reason. Receptionists cancel unpaid reservations; cancelling a paid one requires a Manager or Admin and refunds it (Q-62). Guests request cancellations (FR-CXL).
- **FR-RES-8** Staff assign a physical unit, check in, check out (early departure shortens the stay), and mark no-show, following [reservation-lifecycle.md](../domain/reservation-lifecycle.md).
- **FR-RES-9** Creation is idempotent and conflict-safe (lifecycle "Idempotency"; ADR 016).
- **FR-RES-10** References are unique, random, and human-friendly.
- **FR-RES-11** A failed, conflicting, expired, or unpaid booking is never described as confirmed anywhere (NFR-13).

## FR-PAY Online payment — Planned (M9, UI M10–M11)

- **FR-PAY-1** Guests choose Paymob (full prepayment) or pay at the hotel for website bookings. Staff bookings are pay at hotel (Q-37).
- **FR-PAY-2** Online payment uses Paymob's hosted checkout. No card data is entered on, sent to, or stored by Rivana.
- **FR-PAY-3** While the guest pays, the units are held for about 15 minutes (`AWAITING_PAYMENT`). Expiry or failure releases them and the coupon redemption, and the booking becomes `PAYMENT_FAILED`.
- **FR-PAY-4** Only a verified (HMAC-checked) server-to-server result with the expected amount and currency confirms a booking. The browser return never does.
- **FR-PAY-5** A success that arrives after the hold expired confirms the booking if the units are still free, otherwise it is refunded automatically and staff are alerted (Q-63).
- **FR-PAY-6** Refunds are requested through Paymob's refund API for the captured amount; fees follow Paymob's policy and are not calculated by Rivana (Q-38).
- **FR-PAY-7** Staff see each reservation's payment and refund status, and can retry a failed refund.
- **FR-PAY-8** Payments are charged in USD (supported by the client's Paymob account, Q-54). The Paymob keys are server secrets supplied by the client when M9 starts (Q-55).

## FR-CXL Cancellation requests — Planned (M9, UI M10–M11)

- **FR-CXL-1** A guest may request cancellation from the manage link or "My reservations" until 24 hours before the branch's check-in time on the arrival date, for paid and pay-at-hotel bookings (Q-38).
- **FR-CXL-2** After the deadline the guest sees the branch's contact details instead.
- **FR-CXL-3** The reservation stays `CONFIRMED` and keeps its inventory while the request is open; one open request per reservation.
- **FR-CXL-4** A Manager of the branch or an Admin approves or rejects with a reason (`cancellations:decide`).
- **FR-CXL-5** Approval cancels an unpaid booking at once; for a paid booking it requests the Paymob refund and cancels when Paymob confirms. Rejection keeps the booking `CONFIRMED`.
- **FR-CXL-6** The guest receives email and WhatsApp messages when the request is received and decided, and when the refund completes.
- **FR-CXL-7** Every request, decision, and refund is audited.

## FR-GST Guest verification and profiles — Planned (M8, UI M10–M11)

- **FR-GST-1** Before submitting, the guest verifies their phone with a 6-digit code sent by WhatsApp (valid 10 minutes, 5 attempts, rate-limited). The verification is valid for 30 minutes and one reservation (Q-27, Q-28).
- **FR-GST-2** Rivana keeps one guest profile per verified phone number: phone, latest name and email, verification time, block status, marketing consent, and reservations.
- **FR-GST-3** Staff with `guests:read` search guest profiles by phone or name and see their reservations (within the branches they can access).
- **FR-GST-4** Admin and Manager block or unblock a phone number with a reason (Q-29). A blocked number receives no codes or broadcasts and cannot book online at any branch.
- **FR-GST-5** Guest data is kept indefinitely (Q-13).
- **FR-GST-6** A phone may hold a limited number of upcoming pay-at-hotel website bookings and open payment holds (Q-60).

## FR-LKP Guest access — Planned (M8, UI M10)

- **FR-LKP-1** A guest opens the manage link (sent by email and WhatsApp) to view their reservation, its payment status, and its allowed actions (cancellation request).
- **FR-LKP-2** A guest enters their phone number, receives a WhatsApp code, and then sees all reservations of that number ("My reservations"), for 30 minutes.
- **FR-LKP-3** Staff can resend or rotate a guest's manage link.

## FR-OPS Front-desk operations — Planned (API M8–M9, UI M11)

- **FR-OPS-1** Dashboard per branch: today's arrivals and departures, in-house guests, website bookings not yet entered in the hotel system with their age, open cancellation requests (Manager and Admin), and the latest sync checkpoint with the time the next one is due.
- **FR-OPS-2** Reservation list with filters (status, source, payment, "not yet in hotel system", dates, search) and pagination.
- **FR-OPS-3** Reservation detail with history (audit), price snapshot, payment and refund status, assignment, and the actions allowed for this user.
- **FR-OPS-4** Manual reservation and external-reservation entry forms that prevent double submission.
- **FR-OPS-5** Record a sync checkpoint for the branch, with an optional note. One checkpoint counts for the whole branch.
- **FR-OPS-6** Sync reminder (Q-20): when a branch's last checkpoint is older than its interval (default 30 minutes), every signed-in receptionist of that branch hears a sound and sees a pop-up that cannot be dismissed without an answer: **"I have synced"** records a checkpoint; **"I'm syncing now"** reminds again after the follow-up delay (default 10 minutes). The first answer clears the reminder for everyone at that branch. The pop-up shows how many website bookings are not yet entered in the hotel system.
- **FR-OPS-7** "Mark entered in hotel system" on website reservations (`reservations:pms-entry`), recorded with user and time; overdue entries are highlighted (target Q-61).
- **FR-OPS-8** Cancellation-request queue for Managers and Admins with approve and reject actions and refund status.

## FR-RPT Reporting — Planned (M12)

Definitions, all per branch and date range, with nights counted by stay night:

- **Reservations created**: count by status, source, and payment method, by creation date (`PAYMENT_FAILED` shown separately and excluded from other figures).
- **Room-nights sold**: unit-nights of inventory-consuming lines (`CHECKED_OUT` counts only nights actually stayed).
- **Room-nights available**: Σ nights × capacity (active, unblocked units).
- **Occupancy %**: sold ÷ available.
- **Revenue (recorded, excluding VAT)**: Σ taxable amounts (accommodation + services − discount) of `CONFIRMED`, `CHECKED_IN`, and `CHECKED_OUT` reservations. Reservations with no price (some `EXTERNAL`) are excluded and counted separately. Labelled "recorded prices, not payments".
- **VAT (recorded)** and **discounts** shown separately.
- **Online payments**: captured and refunded amounts from Paymob results.
- **ADR (average daily rate)**: accommodation revenue ÷ priced sold nights.
- **Cancellations**: cancelled ÷ created; cancellation requests approved and rejected.
- **PMS entry**: median and maximum time from confirmation to "entered in hotel system".

Requirements:

- **FR-RPT-1** Manager and Admin view summary, occupancy trend (day, week, month), and listing performance for their branches.
- **FR-RPT-2** Every figure states its definition and data limitations.
- **FR-RPT-3** Statistics are shown on screen only. There is no CSV export (Q-14).

## FR-MKT WhatsApp marketing and feedback — Planned (consent M8, sending M13)

- **FR-MKT-1** The booking form offers an unticked opt-in for offers by WhatsApp; the guest profile stores opt-in time, wording version, and opt-out time (Q-50, Q-58).
- **FR-MKT-2** Opt-out (reply STOP where the provider supports it, or recorded by staff) takes effect immediately.
- **FR-MKT-3** Admin, and Managers for their branches, send broadcasts from approved marketing templates, optionally carrying a coupon code, to guests of chosen branches who opted in, have not opted out, and are not blocked, within a frequency limit (Q-58).
- **FR-MKT-4** Every broadcast is audited with author, audience size, template, and coupon.
- **FR-MKT-5** When staff record check-out, Rivana queues one WhatsApp feedback request for that reservation, sent after a delay (Q-59). Rivana does not claim to know departures it was not told about.
- **FR-MKT-6** Guests reply in WhatsApp; staff read replies in the WhatsApp Business inbox. Rivana stores no feedback (Q-51).

## FR-IAM Identity and access — Implemented for Editor and Admin; Planned for new roles (M4, UI M12)

- **FR-IAM-1** Admin creates staff with roles Editor (content only), Receptionist, Manager, or Admin.
- **FR-IAM-2** Admin assigns Receptionist and Manager accounts to branches.
- **FR-IAM-3** Each capability is enforced server-side, with branch scope for reservation, commercial, and marketing data ([user-roles-and-permissions.md](./user-roles-and-permissions.md)).

## FR-AUD Audit — Planned (M4 table, M6 onward)

- **FR-AUD-1** Every reservation, payment, refund, cancellation-request, inventory, pricing, service, coupon, VAT, branch, guest-block, consent, broadcast, sync-checkpoint, PMS-entry, and staff-access mutation appends an audit event (actor, action, entity, branch, reason, redacted changes, time). Content edits keep `updatedById` (Q-15).
- **FR-AUD-2** Reservation detail shows its history. Manager and Admin search the audit log.
- **FR-AUD-3** Audit events cannot be edited or deleted through the application.

## FR-NTF Notifications — Planned (M8 including WhatsApp settings and templates, M9, M13)

- **FR-NTF-1** Guest transactional messages by email and WhatsApp (Q-32): booking confirmed; payment not completed; cancellation request received, approved, rejected; refund completed; cancelled by the hotel; manage link (resend). Email uses plain-text and simple HTML templates; WhatsApp uses Meta-approved templates. English first (Arabic: Q-10). Verification codes go by WhatsApp only.
- **FR-NTF-2** Staff alert email to a branch inbox on each new confirmed website booking (reminding staff to enter it in the hotel system) and on each new cancellation request (address: Q-10).
- **FR-NTF-3** Messages are queued in the outbox per channel inside the transaction that changes the status, and retried after commit. A failure never rolls back the reservation and is visible on reservation detail.
- **FR-NTF-4** Marketing broadcasts and feedback requests use their own template classes and never delay transactional messages (ADR 028).
- **FR-NTF-5** The Admin configures WhatsApp in the dashboard (Q-67): the business number (empty placeholder until the client supplies it) and the provider's phone-number id; the access token stays a server secret and the screen only shows whether it is configured. While WhatsApp is not configured nothing is sent and online booking cannot be enabled.
- **FR-NTF-6** The Admin manages WhatsApp message templates per purpose and language (template name as approved in Meta, category, variables mapped to allowlisted booking fields, preview text, active switch). A purpose without an active template is reported as a setup gap.
- **FR-NTF-7** The Admin can send a test WhatsApp message to any phone number and sees the provider's success or error.
