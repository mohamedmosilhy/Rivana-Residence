# User stories and acceptance criteria

Acceptance criteria (AC) are written so they can become tests. Stories for the website and content management are implemented and covered by the existing E2E suites. Booking and operations stories are planned, and their test ids are listed in [../testing/test-matrix.md](../testing/test-matrix.md).

## Visitor (implemented)

**US-V1 Explore the residence.** As a visitor, I understand the property, compare rooms, inspect facilities, and contact the residence, on phone and desktop.
- AC1: Every public page renders at 320–1440 px without horizontal overflow, with correct headings and unique metadata.
- AC2: Room and facility pages show their facts and galleries. Unpublished items return 404 and are not in the sitemap.
- AC3: The contact form validates, submits once, and gives accessible feedback.

**US-V2 See the current offer.** As a visitor, I see the active promotion, copy its code, and dismiss it, with keyboard and screen-reader feedback.

**US-V3 Find how to book.** As a visitor, I find Book Now everywhere I expect it. Where online booking is not available, it explains honestly how to book instead.

## Content editor and administrator (implemented)

**US-E1 Update a room.** As an editor, I update a room, replace its hero image, and publish the change without developer help.
- AC1: Publishing invalidates only the affected public content.

**US-E2 Run a promotion.** As an editor, I publish a time-bounded promotion, and it appears only inside its window.

**US-E3 Manage media safely.** As an editor, I upload and replace images. A referenced image cannot be deleted by accident.

**US-E4 Protected dashboard.** Unauthenticated users cannot reach dashboard data or mutations, and staff see only the areas their role allows.

## Guest (planned)

**US-G1 Choose a branch.** As a guest, I choose which Rivana branch to stay at.
- AC1: With one active, bookable branch, `/book` goes straight to it.
- AC2: With several, `/book` lists active branches with name, city, and summary, and each opens `/book/[slug]`.
- AC3: An inactive or unknown branch slug returns the not-found page.

**US-G2 Search availability.** As a guest, I enter dates and guests and see which room types I can book and for how much.
- AC1: Check-out must be after check-in, and check-in cannot be in the past (branch time zone). Errors appear next to the fields and are announced.
- AC2: Each eligible room type shows available or unavailable with a reason. Available ones show the total and a per-night breakdown in US dollars.
- AC3: A room type fully booked on any night of the stay shows "not available for these dates".
- AC4: The result reflects reservations committed before the search.
- AC5: Room types of other branches never appear.

**US-G3 Submit a request.** As a guest, I verify my phone, enter my details, submit, and get a reference.
- AC1: Name, email, and phone are required, consent to the privacy notice is required, and special requests are optional.
- AC1a: I receive a 6-digit code by WhatsApp and must enter it before I can submit. A wrong code shows an error; after 5 wrong attempts or 10 minutes I must request a new code. "Send again" is limited.
- AC1b: If my number is blocked, I see a neutral message asking me to contact the hotel, and no code is sent.
- AC2: The review step shows branch, room type, dates, nights, guests, the per-night breakdown, the total, "pay at the hotel" (Q-08), and the request-to-book explanation (Q-02).
- AC3: Submitting twice (double click or a retry after a timeout) creates one reservation.
- AC4: On success I see the reference and status "request received", and I get an email and a WhatsApp message with a manage link.
- AC5: If the last room was taken meanwhile, I see "no longer available" with a way back to the results, and no reservation is created.
- AC6: If the price changed, I see the new total and must accept it explicitly before resubmitting.

**US-G4 View or cancel my reservation.** As a guest, I open my link to see my reservation and cancel a pending request.
- AC1: A valid link shows my reservation; an invalid or expired link shows a neutral message and a "send me a new link" form.
- AC2: A pending request can be cancelled after confirmation in a dialog. Its inventory is released immediately.
- AC3: A confirmed reservation has no online cancel action. It shows the hotel's contact details for cancellations (Q-07).

**US-G5 My reservations.** As a guest, I enter my phone number and a WhatsApp code to see my reservations.
- AC1: After a correct code I see every reservation made with that number, for 30 minutes.
- AC2: Code requests and attempts are rate-limited.

## Receptionist (planned)

**US-R1 Work today's desk.** As a receptionist, I see arrivals, departures, in-house guests, and pending requests for my branch.
- AC1: Only reservations of my assigned branches appear.
- AC2: Pending requests show their age. Those older than the target are highlighted.
- AC3: The dashboard shows when the branch was last reconciled with the hotel system and when the next sync is due.

**US-R1a Sync reminder.** As a receptionist, I am reminded to sync with the hotel system every interval (default 30 minutes).
- AC1: When the branch is due, I hear a sound and a pop-up opens on whatever dashboard page I am on. It cannot be closed without choosing "I have synced" or "I'm syncing now".
- AC2: "I have synced" records a checkpoint (with an optional note) and clears the reminder for everyone at my branch.
- AC3: "I'm syncing now" reminds me again after the follow-up delay (default 10 minutes), when I must confirm "I have synced".
- AC4: If the browser blocks sound, the pop-up still opens and the tab title flashes.
- AC5: Every answer is in the audit log with my name and time.

**US-R2 Confirm or decline a request.** As a receptionist, I check the hotel system and then confirm or decline.
- AC1: Confirming requires ticking "I have checked the hotel system and entered this reservation there".
- AC2: Declining requires a reason. Inventory is released.
- AC3: The guest gets an email and a WhatsApp message in both cases. The action appears in the history with my name.
- AC4: If another receptionist changed it first, I'm told to reload (`412`).

**US-R3 Create a reservation for a guest.** As a receptionist, I book on behalf of a phone or walk-in guest.
- AC1: Same availability and price rules as the website. I cannot change prices.
- AC2: It is created `CONFIRMED`. The confirmation email is optional.
- AC3: If inventory is gone, I'm told and nothing is created.

**US-R4 Record an external reservation.** As a receptionist, I record a reservation that already exists in the hotel system.
- AC1: An external reference is required. Duplicates in the same branch are refused and the existing one is linked.
- AC2: If Rivana has no free inventory, I see a **conflict** notice with the escalation steps, and nothing is created.
- AC3: The reservation is marked as external everywhere it appears.

**US-R5 Block a room.** As a receptionist, I block a physical room for maintenance.
- AC1: A block that would make sold exceed capacity on any night is refused, naming the affected reservations' references (Q-17).
- AC2: Overlapping blocks on the same room are refused.
- AC3: Availability reflects the block immediately.

**US-R6 Front desk.** As a receptionist, I assign rooms, check guests in and out, and mark no-shows.
- AC1: Only active, unblocked rooms of the right type and branch, not assigned to an overlapping stay, can be assigned.
- AC2: Check-in requires an assignment and is allowed from the check-in date onward.
- AC3: An early check-out shortens the stay and releases the remaining nights.

**US-R7 Modify a reservation.** As a receptionist, I change dates, room type, or guest details.
- AC1: Changes to dates or room type re-check inventory and show the old and new totals before I confirm.
- AC2: Guest detail changes are recorded in history without the personal values.

## Manager (planned)

**US-M1 Manage prices.** As a manager, I set base rates and seasonal and offer periods for my branches' room types.
- AC1: Overlapping periods of the same kind are refused.
- AC2: The calendar shows the effective nightly price.
- AC3: Existing reservations keep their prices.
- AC4: Every change is in the audit log with before and after values.

**US-M2 See statistics.** As a manager, I see reservation counts, occupancy, revenue, and room performance for a date range.
- AC1: Figures match the definitions in FR-RPT and state their limitations.
- AC2: Only my branches are included.

**US-M3 Review compliance.** As a manager, I review the audit log, pending-request ages, and sync checkpoints.
- AC1: I can filter the audit log by branch, user, entity, and date.
- AC2: I see branches whose sync is overdue and the checkpoint history.

**US-M4 Block a phone number.** As a manager or admin, I block a phone number that made fake reservations.
- AC1: I find the guest by phone or name and see their reservations.
- AC2: Blocking requires a reason. From then on, the number cannot get codes or book online at any branch.
- AC3: Unblocking restores online booking. Both actions are audited.

## Admin (planned additions)

**US-A1 Manage branches.** As an admin, I create branches and switch online booking on or off.
- AC1: A branch with booking off still shows its rooms on the website, with the honest disabled Book Now.
- AC2: Deactivation behaves as in the branch model.

**US-A2 Manage staff access.** As an admin, I create staff with roles and assign them to branches.
- AC1: Receptionists and managers can access only their assigned branches.
- AC2: Receptionists and managers cannot reach CMS pages or actions (`403`).

**US-A4 Sync reminder settings.** As an admin, I set each branch's sync reminder interval (default 30 minutes) and follow-up delay (default 10 minutes) in the dashboard.
- AC1: The new interval applies from the next reminder without a deploy.

**US-A3 CMS unchanged.** As an admin, I keep managing website content exactly as today.
- AC1: All existing CMS E2E tests pass.
