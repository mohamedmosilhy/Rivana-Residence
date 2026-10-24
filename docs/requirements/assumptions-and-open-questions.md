# Assumptions and open questions

Each question has a **recommended answer**. The design documents use the recommendation and label it. "Blocks" names the first milestone that cannot finish without an answer. Questions marked ★ are consequential (security, data integrity, or business behavior) and must be confirmed before that milestone starts.

## Decided

| Id | Decision | Decided | Effect |
| --- | --- | --- | --- |
| Q-01 | **Keep `EDITOR` as a CMS-only role** with no reservation capabilities | 2026-10-24, project owner | ADR 018; capability matrix unchanged for Editor |
| Q-02 | **Request to book**: website reservations are `PENDING` and hold inventory until a receptionist confirms or declines after checking the hotel system | 2026-10-24, project owner | Lifecycle as designed; NFR-13 wording |
| Q-07 | **Guests may cancel only `PENDING` requests online.** `CONFIRMED` reservations are cancelled by contacting the hotel. No fees are calculated. A later written policy may extend online cancellation | 2026-10-24, project owner | ADR 019; API-G2 accepts `PENDING` only |
| Q-16 | **Launch together**: the public launch (roadmap Phase 12) waits for the reservation system and goes live with online booking | 2026-10-24, project owner (differs from the recommendation) | Phase 12 and M12 become one release; Phase 12 infrastructure work may start earlier (see milestones) |
| Q-13 | **Keep guest personal data indefinitely.** No automatic deletion or anonymization of reservation or guest-profile data | 2026-10-24, project owner | No retention job. The privacy notice must say data is kept, and the client should confirm this with their legal adviser (Egypt's PDPL); see risk RK-14 |
| Q-14 | **Statistics on screen only, no CSV export.** The hotel's operational system already produces exports | 2026-10-24, project owner | FR-RPT has no export; reports stay simple |
| Q-20 | **Sync reminders every 30 minutes per branch, configurable by Admin.** When a branch is due, signed-in receptionists get a sound and a pop-up they must answer: "I have synced" (records a checkpoint) or "I'm syncing now" (reminds again after the follow-up delay, default 10 minutes). One checkpoint clears the reminder for the whole branch | 2026-10-24, project owner | FR-OPS-5/6; branch settings; reminder dialog in the staff shell |
| Q-27 | **Verified phone profiles, no guest accounts.** Every online booking verifies the guest's phone with a one-time code. Rivana keeps one guest profile per verified phone number, with history for staff. Guests see their bookings with phone + code. No passwords or profile pages | 2026-10-24, project owner | ADR 019 (revised); `Guest` and `PhoneVerification` tables; customer accounts remain a later option |
| Q-28 | **One-time codes by WhatsApp only.** Guests without WhatsApp book by contacting the hotel | 2026-10-24, project owner | `WhatsAppSender` port; no SMS provider; known limitation L-13 |
| Q-29 | **Admin and Manager can block a phone number.** A blocked number cannot receive codes or book online, at any branch. Existing reservations stay. Reason required, audited | 2026-10-24, project owner | Capability `guests:block` for Manager and Admin |
| Q-31 | **Prices in US dollars**, for all branches | 2026-10-24, project owner | ADR 020; integer cents; the scope PDF's EGP examples are restated in USD |
| Q-32 | **Guest notifications by email and WhatsApp.** Email stays required on online bookings | 2026-10-24, project owner | FR-NTF; outbox per channel; WhatsApp message templates need Meta approval |

## Decisions requiring approval

| Id | Question | Recommendation | Blocks |
| --- | --- | --- | --- |
| Q-03 | Branch URLs: path-based (`/book/new-cairo`) or subdomains (`newcairo.rivanaresidence.com`)? | Path-based now; subdomains later if wanted (needs DNS access the client lacks) | M5 |
| Q-04 | Branch-specific website content (pages, facilities, promotions) in this release? | No. Rooms, prices, contact, and images are per branch; other content stays global | M5 |
| Q-05 ★ | Do displayed prices include VAT, service charge, and city tax? Are there any fees? | Unknown. Until answered, show prices as entered with no tax wording, and implement no tax logic | M8 (wording) |
| Q-06 | Are "offers" simply date-based prices applied automatically (PDF example), and do they win over seasonal prices? | Yes. `OFFER` periods take precedence over `SEASONAL`, which takes precedence over base. No codes | M6 |
| Q-08 | Payment: pay at hotel only for this release? | Yes. Online payment is a separate project (gateway, refunds, PCI scope) | M7 |
| Q-09 | Stay rules: maximum nights, how far ahead, same-day cut-off, minimum stay, check-in and check-out times | 30 nights max, 540 days ahead, no same-day cut-off, no minimum stay; times as display text per branch | M6 |
| Q-10 | WhatsApp setup: which provider (Meta WhatsApp Cloud API directly, or a provider such as Twilio), which business number, and who completes Meta business verification and template approval? Which inbox gets staff alerts? Arabic templates? | Meta Cloud API directly if the client can complete business verification, otherwise a provider; one alert inbox per branch; English templates first, Arabic soon after | M7 |
| Q-11 | Should unanswered pending requests expire automatically? What is the response target? | No auto-expiry; highlight after 4 working hours and include it in the manager review | M9 |
| Q-12 | One room per reservation, or several rooms in one booking? | One room per reservation in v1 (the model supports more later) | M7 |
| Q-15 | Audit CMS content changes too (PDF §9 mentions website content)? | Later. Reservation, pricing, inventory, and access first; CMS edits keep `updatedById` | M10 |
| Q-17 | May a manager force a block or unit deactivation that would oversell? | No. Staff must first move or cancel affected reservations | M6 |
| Q-18 | Reinstating cancelled or declined reservations, undoing check-in | Not in v1 (create a new reservation instead) | M7 |
| Q-19 | When staff change dates or room type, are changed nights re-priced at current rates? | Yes, with old and new totals shown, and manager override possible | M7 |
| Q-21 | Name of the hotel's operational system (PMS), and can it export daily arrival or booking reports? | Needed for the reconciliation procedure; informational | M12 |
| Q-22 | Child age definition and infant policy | Use the existing adult and child counts; policy text from the client | M8 |
| Q-23 | Actual physical room numbers per room type and branch | Data from the client before go-live | M12 |
| Q-24 | Staff list with roles and branch assignments | Data from the client before go-live | M12 |
| Q-25 | Managed PostgreSQL provider | Choose in Phase 12; must meet ADR 022 requirements | M12 |
| Q-26 | May receptionists and managers read and manage contact enquiries? | Yes (front-desk work) | M4 |
| Q-30 | Guest-facing text for phone verification and indefinite data retention (privacy notice, consent wording) | Client-approved text before launch | M8 |
| Q-33 | Should Admins and Managers use a second sign-in step (authenticator app) before launch? | Yes (Better Auth two-factor plugin; no custom crypto) | M11 |
| Q-34 | Should contact-form enquiries also be kept permanently, like guest data? | Owner to decide; today the proposal is to purge archived enquiries after 12 months | M12 |
| Q-35 | Should Managers also get the sync pop-up, or only Receptionists? | Only Receptionists; Managers see overdue branches on the overview | M9 |

## Client scope document v2.0

The client-facing scope ([../delivery/Rivana_Residence_Project_Scope_v2.pdf](../delivery/Rivana_Residence_Project_Scope_v2.pdf), source [client-scope-v2.html](../delivery/client-scope-v2.html), sent for approval on 2026-10-24) asks these questions in plain language. Its section 17 numbers map to the ids above:

| PDF # | Id | PDF # | Id | PDF # | Id |
| --- | --- | --- | --- | --- | --- |
| 1 | Q-05 | 8 | Q-06 | 15 | Q-15 |
| 2 | Q-08 | 9 | Q-19 | 16 | Q-26 |
| 3–4 | Q-09 | 10 | Q-17 | 17 | Q-34 |
| 5 | Q-10 (Arabic) | 11 | Q-18 | 18 | Q-33 |
| 6 | Q-11 | 12 | Q-22 | 19 | Q-35 |
| 7 | Q-12 | 13 | Q-03 | | |
| | | 14 | Q-04 | | |

Its section 15 ("What we need from you") covers Q-10 (WhatsApp setup), Q-21, Q-23, Q-24, Q-25, and Q-30. Section 16 lists the decided items above for the client to confirm by signing.

## Assumptions in use

| Id | Assumption | Confidence | If wrong |
| --- | --- | --- | --- |
| A-1 | One property today (New Cairo); the three CMS rooms are its room types | High (seed data, website) | Migration assigns them to the wrong branch, which Admin can fix while no inventory exists |
| A-2 | Guests book a room type, not a specific numbered room | High (hotel practice; prompt) | Assignment at booking is possible with the same tables |
| A-3 | Price is per room per night, regardless of guest count | Medium (PDF examples) | Add occupancy-based pricing to `PriceResolver` |
| A-4 | One currency, US dollars, for all branches (owner decision 2026-10-24) | High | `currency` columns exist, so a second currency later needs conversion rules, not schema changes |
| A-5 | The PMS has no API or export we can use automatically | High (brief) | Implement a `HotelSystemSync` adapter |
| A-6 | Staff are present daily to confirm requests and record external bookings | Medium | Pending requests wait longer; inventory is held |
| A-7 | SMTP and a WhatsApp Business sender will be configured for production | Medium | Without WhatsApp no guest can verify, so online booking stays off; without SMTP guests rely on WhatsApp messages |
| A-8 | The production database will be PostgreSQL 17+ with `btree_gist` | Medium | ADR 022 fallback |
| A-9 | The scope PDF was never signed; the current brief overrides it where they differ | High | Revisit the traceability matrix |
