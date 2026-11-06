# User stories and acceptance criteria

Acceptance criteria (AC) are written so they can become tests. Stories for the website and content management are implemented and covered by the existing E2E suites (some change with the branch websites in M5, as noted). Booking, payment, operations, and messaging stories are planned; their test ids are in [../testing/test-matrix.md](../testing/test-matrix.md). The client decisions of 2026-11-06 ([Q-36…Q-53](./assumptions-and-open-questions.md#decided-2026-11-06-client-decisions)) are reflected.

## Visitor

**US-V1 Explore the residence (implemented; per branch from M5).** As a visitor, I understand the property, compare rooms and apartments, inspect facilities, and contact the residence, on phone and desktop.
- AC1: Every public page renders at 320–1440 px without horizontal overflow, with correct headings and unique metadata.
- AC2: Listing and facility pages show their facts and galleries. Unpublished items return 404 and are not in the sitemap.
- AC3: The contact form validates, submits once, and gives accessible feedback.

**US-V2 ~~See the current offer~~ (implemented in Phase 7; retired by Q-47).** The promotion popup is removed in M5. Acceptance after M5: no public page renders promotion popup markup or its client script.

**US-V3 Find how to book (implemented).** As a visitor, I find Book Now everywhere I expect it. Where online booking is not available, it explains honestly how to book instead.

**US-V4 Choose and switch branches (planned M5).** As a visitor, I choose which Rivana branch I'm interested in and can switch later.
- AC1: With two or more active branches, `/` shows a chooser listing each branch's name, city, summary, and image; with one, `/` takes me straight to that branch's site.
- AC2: On a branch site, every page shows that branch's own text and images, and the header names the branch.
- AC3: The switcher takes me to the same kind of page at the other branch, or to its home when that page does not exist there.
- AC4: Old links (`/rooms/…`, `/about`, legacy `*.html`) open the matching page of the first branch through one permanent redirect.

**US-V5 Find the branch (planned M5).** As a visitor, I see where the branch is on an interactive Google Map and can open directions.
- AC1: The branch Contact page shows the map for that branch; zoom and pan work inside the map.
- AC2: When the map cannot load, the address and an "Open directions in Google Maps" link are still shown.

**US-V6 Understand rooms versus apartments (planned M5).** As a visitor, I can tell whether a listing is a hotel room or an apartment.
- AC1: Each card and detail page shows a Room or Apartment badge; apartments show bedrooms and bathrooms when recorded.
- AC2: Navigation says "Rooms & Apartments", or "Rooms" or "Apartments" when the branch offers only one kind.

## Content editor and administrator

**US-E1 Update a listing (implemented; per branch from M5).** As an editor, I update a room or apartment, replace its hero image, and publish the change without developer help.
- AC1: Publishing invalidates only the affected public content of that branch.
- AC2 (M5): I choose the branch whose content I edit; the listing form has an accommodation type.

**US-E2 ~~Run a promotion~~ (implemented in Phase 5; retired by Q-47).** Replaced by US-M5 (coupons) and US-M7 (broadcasts).

**US-E3 Manage media safely (implemented).** As an editor, I upload and replace images. A referenced image cannot be deleted by accident.

**US-E4 Protected dashboard (implemented).** Unauthenticated users cannot reach dashboard data or mutations, and staff see only the areas their role allows.

**US-E5 Edit a branch's pages (planned M5).** As an editor, I edit Home, About, and Contact for a chosen branch; other branches are unaffected.

## Guest (planned)

**US-G1 Start booking at my branch.** As a guest, I start booking on the branch site I chose.
- AC1: Book Now on a branch site opens that branch's booking page; a listing's Book Now preselects it.
- AC2: An inactive or unknown branch slug returns the not-found page; a branch with online booking off explains how to book by contacting the hotel.

**US-G2 Search availability.** As a guest, I enter dates and guests and see only the rooms and apartments I can book, with prices before VAT.
- AC1: Check-out must be after check-in, and check-in cannot be in the past (branch time zone). Errors appear next to the fields and are announced.
- AC2: Only listings of this branch that are available for every night and fit the party are offered, each with price per night and stay total before VAT. Unavailable ones show a reason.
- AC3: The result reflects reservations and payment holds committed before the search.
- AC4: Listings of other branches never appear.

**US-G3 Book and get confirmed (pay at hotel).** As a guest, I choose one or more units, verify my phone, add extras, review the price with VAT, choose to pay at the hotel, and get an immediate confirmation.
- AC1: Name, email, and phone are required, privacy consent is required, special requests are optional.
- AC1a: I receive a 6-digit code by WhatsApp and must enter it before I can submit. A wrong code shows an error; after 5 wrong attempts or 10 minutes I must request a new code. "Send again" is limited.
- AC1b: If my number is blocked, I see a neutral message asking me to contact the hotel, and no code is sent.
- AC2: I can add several units (rooms, apartments, or both) for the same dates to one booking.
- AC3: The review shows the branch, each unit, dates, nights, guests, the per-night breakdown, chosen services, the coupon discount, the subtotal, **VAT as a separate line**, the total, the payment choice, and the cancellation terms.
- AC4: Submitting twice (double click or a retry after a timeout) creates one reservation.
- AC5: On success the response and the database both say **`CONFIRMED`**; I see the reference and "Confirmed", and I receive an email and a WhatsApp confirmation that say "confirmed", sent only after the reservation was saved.
- AC6: If a unit was taken meanwhile, I see "no longer available" with a way back to the results, no reservation is created, and no message is sent.
- AC7: If the price changed, I see the new total and must accept it explicitly before resubmitting; nothing is created until I do.
- AC8: If I already hold the maximum number of upcoming pay-at-hotel website bookings for my phone (Q-60), I am asked to contact the hotel and nothing is created.

**US-G4 Pay online with Paymob.** As a guest, I choose to pay online and am confirmed when the payment succeeds.
- AC1: Choosing Paymob takes me to Paymob's payment page; my units are held for about 15 minutes meanwhile.
- AC2: After a successful payment I see "Confirmed" and receive the confirmation messages; the booking is `CONFIRMED` only after Paymob's verified result arrived.
- AC3: If the payment fails, I cancel it, or the hold expires, I see "Payment not completed", the units are released, my coupon use is released, and I receive no confirmation.
- AC4: The return page never shows "Confirmed" because of the address I returned to; it shows the server's status.

**US-G5 Add extras and a coupon.** As a guest, I can add breakfast or airport transportation and enter one coupon code.
- AC1: Extras are never preselected; the review may offer ones I skipped, and nothing is added unless I accept.
- AC2: A valid code reduces the total before VAT; an invalid, expired, used-up, or wrong-branch code shows why and leaves the total unchanged.

**US-G6 View my booking or request cancellation.** As a guest, I open my link or "My reservations" to see my booking and request cancellation.
- AC1: A valid link shows my reservation, payment status, and any cancellation request; an invalid or expired link shows a neutral message and a "send me a new link" form.
- AC2: Until 24 hours before the branch's check-in time on my arrival date, I can request cancellation with an optional reason; the booking stays confirmed until the hotel decides.
- AC3: After that deadline there is no request button; the branch's contact details are shown.
- AC4: I receive messages when my request is received and decided; if it was approved and I paid online, I am told the refund was requested through Paymob and when it completes.

**US-G7 My reservations.** As a guest, I enter my phone number and a WhatsApp code to see my reservations.
- AC1: After a correct code I see every reservation made with that number, for 30 minutes.
- AC2: Code requests and attempts are rate-limited.

**US-G8 Offers by WhatsApp (planned M13).** As a guest, I can opt in to receive offers by WhatsApp and stop them at any time.
- AC1: The opt-in checkbox is unticked by default and booking works without it.
- AC2: After I opt out, I receive no further offers.

**US-G9 Feedback after my stay (planned M13).** As a guest, I receive one WhatsApp message asking for feedback after the hotel records my check-out, and I can reply in the chat.

## Receptionist (planned)

**US-R1 Work today's desk.** As a receptionist, I see arrivals, departures, in-house guests, and new website bookings for my branch.
- AC1: Only reservations of my assigned branches appear.
- AC2: Website bookings not yet entered in the hotel system are listed with their age; those older than the target (Q-61) are highlighted.
- AC3: The dashboard shows when the branch was last reconciled with the hotel system and when the next sync is due.

**US-R1a Sync reminder.** As a receptionist, I am reminded to sync with the hotel system every interval (default 30 minutes).
- AC1: When the branch is due, I hear a sound and a pop-up opens on whatever dashboard page I am on. It cannot be closed without choosing "I have synced" or "I'm syncing now".
- AC2: "I have synced" records a checkpoint (with an optional note) and clears the reminder for everyone at my branch.
- AC3: "I'm syncing now" reminds me again after the follow-up delay (default 10 minutes).
- AC4: If the browser blocks sound, the pop-up still opens and the tab title flashes.
- AC5: Every answer is in the audit log with my name and time.
- AC6: The pop-up shows how many website bookings are not yet entered in the hotel system.

**US-R2 Enter a website booking into the hotel system.** As a receptionist, I copy each new confirmed website booking into the hotel system and mark it entered.
- AC1: "Mark entered in hotel system" records my name and time and removes the booking from the "not yet entered" list.
- AC2: If the hotel system has no room for it (a cross-system conflict), I follow the conflict procedure: offer an alternative unit, or ask a Manager to cancel it (with a refund if paid). The guest is told by the hotel.
- AC3: If another receptionist changed the reservation first, I'm told to reload (`412`).

**US-R3 Create a reservation for a guest.** As a receptionist, I book on behalf of a phone or walk-in guest.
- AC1: Same availability, price, services, coupon, and VAT rules as the website. I cannot change prices.
- AC2: It is created `CONFIRMED` and paid at the hotel. The confirmation message is optional.
- AC3: If inventory is gone, I'm told and nothing is created.

**US-R4 Record an external reservation.** As a receptionist, I record a reservation that already exists in the hotel system.
- AC1: An external reference is required. Duplicates in the same branch are refused and the existing one is linked.
- AC2: If Rivana has no free inventory, I see a **conflict** notice with the escalation steps, and nothing is created.
- AC3: The reservation is marked as external everywhere it appears.

**US-R5 Block a unit.** As a receptionist, I block a room or apartment unit for maintenance.
- AC1: A block that would make sold exceed capacity on any night is refused, naming the affected reservations' references (Q-17).
- AC2: Overlapping blocks on the same unit are refused.
- AC3: Availability reflects the block immediately.

**US-R6 Front desk.** As a receptionist, I assign units, check guests in and out, and mark no-shows.
- AC1: Only active, unblocked units of the right listing and branch, not assigned to an overlapping stay, can be assigned.
- AC2: Check-in requires an assignment and is allowed from the check-in date onward.
- AC3: An early check-out shortens the stay and releases the remaining nights. Recording check-out queues the feedback request (from M13).

**US-R7 Modify or cancel a reservation.** As a receptionist, I change dates, units, or guest details, and cancel unpaid reservations.
- AC1: Changes to dates or units re-check inventory and show the old and new totals with VAT before I confirm.
- AC2: Guest detail changes are recorded in history without the personal values.
- AC3: I cannot cancel a reservation paid through Paymob; a Manager or Admin does that (Q-62).

## Manager (planned)

**US-M1 Manage prices.** As a manager, I set base nightly prices and date periods for my branches' listings.
- AC1: Overlapping periods for one listing are refused.
- AC2: The calendar shows the effective nightly price.
- AC3: Existing reservations keep their prices.
- AC4: Every change is in the audit log with before and after values.

**US-M2 See statistics.** As a manager, I see reservations, occupancy, revenue excluding VAT, VAT, discounts, online payments and refunds, and listing performance for a date range.
- AC1: Figures match the definitions in FR-RPT and state their limitations.
- AC2: Only my branches are included.

**US-M3 Review compliance.** As a manager, I review the audit log, hotel-system entry ages, and sync checkpoints.
- AC1: I can filter the audit log by branch, user, entity, and date.
- AC2: I see branches whose sync is overdue, the checkpoint history, and website bookings entered late or not yet entered.

**US-M4 Block a phone number.** As a manager or admin, I block a phone number that made fake reservations.
- AC1: I find the guest by phone or name and see their reservations.
- AC2: Blocking requires a reason. From then on, the number cannot get codes, book online, or receive broadcasts at any branch.
- AC3: Unblocking restores online booking. Both actions are audited.

**US-M5 Manage coupons and services.** As a manager, I create coupon codes and set breakfast and transfer prices for my branches.
- AC1: A coupon is a percentage or a fixed USD amount, with optional dates, total limit, per-phone limit, and branch scope limited to my branches.
- AC2: I see how many times each code was used.
- AC3: I can switch a service off for my branch; it then no longer appears in booking.

**US-M6 Decide cancellation requests.** As a manager (my branches) or admin, I approve or reject guests' cancellation requests.
- AC1: Rejecting requires a reason; the booking stays confirmed and the guest is told why.
- AC2: Approving an unpaid booking cancels it and releases its units.
- AC3: Approving a paid booking requests a Paymob refund of the amount paid; the booking becomes cancelled when Paymob confirms; a failed refund is shown with a retry action.
- AC4: Receptionists cannot decide requests.

**US-M7 Send offers by WhatsApp (planned M13).** As a manager (my branches) or admin, I send an approved WhatsApp offer, optionally with a coupon code, to opted-in guests.
- AC1: I see the number of recipients before sending; only opted-in, not opted-out, non-blocked guests of the chosen branches are included.
- AC2: Every broadcast is audited.

## Admin (planned additions)

**US-A1 Manage branches.** As an admin, I create branches with their content, contact, map, and check-in time, and switch online booking on or off.
- AC1: A branch with booking off still shows its site, with the honest disabled Book Now.
- AC2: Deactivation behaves as in the branch model.
- AC3: Online booking cannot be switched on while the VAT rate is unset.

**US-A2 Manage staff access.** As an admin, I create staff with roles and assign them to branches.
- AC1: Receptionists and managers can access only their assigned branches.
- AC2: Receptionists and managers cannot reach CMS pages or actions (`403`).

**US-A3 CMS unchanged in spirit.** As an admin, I keep managing website content as today, now per branch.
- AC1: All existing CMS E2E tests pass (updated for branch selection in M5).

**US-A4 Sync reminder settings.** As an admin, I set each branch's sync reminder interval (default 30 minutes) and follow-up delay (default 10 minutes).
- AC1: The new interval applies from the next reminder without a deploy.

**US-A5 Set VAT.** As an admin, I set the VAT percentage for all branches to whatever rate applies (for example 5%, 6%, or 15%); no other role can.
- AC1: The new rate applies to quotes and bookings made after the change; existing reservations keep the rate they stored.
- AC2: The change is audited.
- AC3: Managers, receptionists, and editors cannot see or change the setting (`403`).

**US-A6 Set up WhatsApp.** As an admin, I enter the WhatsApp Business number when the client provides it, manage the message templates, and send a test message.
- AC1: Until a number is saved, the screen shows it as not configured, nothing is sent, and online booking cannot be enabled.
- AC2: I can add, edit, and deactivate a template for each message purpose and language, choosing its variables from a fixed list of booking fields; a purpose with no active template is listed as a setup gap.
- AC3: "Send test message" sends the test template to the phone I enter and shows success or the provider's error; the result is audited.
- AC4: The provider access token is never shown or editable in the browser; the screen only says whether it is configured.
