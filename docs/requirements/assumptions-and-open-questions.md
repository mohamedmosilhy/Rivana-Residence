# Assumptions and open questions

Each open question has a **recommended answer**. The design documents use the recommendation and label it. "Blocks" names the first milestone that cannot finish without an answer. Questions marked ★ are consequential (security, data integrity, money, or business behavior) and must be confirmed before that milestone starts.

The client decisions of **2026-11-06** (two batches: the main decisions, then Q-05, Q-54, Q-55, and Q-67 later the same day) were relayed by the project owner on that date; the date of the client meeting itself is not recorded. Where they conflict with earlier planned behavior, they win. Earlier decisions they replace are listed under [Superseded](#superseded-decisions), so the history stays readable. Milestone numbers refer to the replanned roadmap ([../delivery/roadmap.md](../delivery/roadmap.md#reservation-milestones)).

## Decided

### Decided 2026-10-24 (still in force)

| Id | Decision | Decided | Effect |
| --- | --- | --- | --- |
| Q-01 | **Keep `EDITOR` as a CMS-only role** with no reservation capabilities. Editors manage the content of every branch (no branch scope) | 2026-10-24, project owner | ADR 018; capability matrix unchanged for Editor |
| Q-16 | **Launch together**: the public launch (roadmap Phase 12) waits for the reservation system and goes live with online booking | 2026-10-24, project owner (differs from the recommendation) | Phase 12 and M15 are one release; Phase 12 infrastructure work may start earlier |
| Q-13 | **Keep guest personal data indefinitely.** No automatic deletion or anonymization of reservation or guest-profile data | 2026-10-24, project owner | No retention job. The privacy notice must say data is kept, and the client should confirm this with their legal adviser (Egypt's PDPL); see risk RK-14 |
| Q-14 | **Statistics on screen only, no CSV export.** The hotel's operational system already produces exports | 2026-10-24, project owner | FR-RPT has no export |
| Q-20 | **Sync reminders every 30 minutes per branch, configurable by Admin.** Signed-in receptionists get a sound and a pop-up they must answer: "I have synced" (records a checkpoint) or "I'm syncing now" (reminds again after the follow-up delay, default 10 minutes). One checkpoint clears the reminder for the whole branch | 2026-10-24, project owner | FR-OPS-5/6 |
| Q-27 | **Verified phone profiles, no guest accounts.** Every online booking verifies the guest's phone with a one-time code. One guest profile per verified phone number. Guests see their bookings with phone + code. No passwords or profile pages | 2026-10-24, project owner | ADR 019 |
| Q-28 | **One-time codes by WhatsApp only.** Guests without WhatsApp book by contacting the hotel | 2026-10-24, project owner | `WhatsAppSender` port; known limitation L-13 |
| Q-29 | **Admin and Manager can block a phone number.** A blocked number cannot receive codes, book online, or receive marketing broadcasts, at any branch. Existing reservations stay. Reason required, audited | 2026-10-24, project owner | Capability `guests:block` |
| Q-31 | **Prices in US dollars**, for all branches | 2026-10-24, project owner | ADR 020; integer cents |
| Q-32 | **Guest notifications by email and WhatsApp.** Email stays required on online bookings | 2026-10-24, project owner | FR-NTF; outbox per channel |

### Decided 2026-11-06 (client decisions)

| Id | Decision | Effect |
| --- | --- | --- |
| Q-36 | **Immediate confirmation.** A website booking becomes `CONFIRMED` as soon as Rivana has reserved its inventory: at submission for pay-at-hotel bookings, or when Paymob's verified payment result arrives for online payments (Q-37). There is no receptionist approval. `PENDING` and `DECLINED` are removed from the design. Supersedes Q-02 | ADR 024; lifecycle; NFR-13; RK-1 rises |
| Q-37 | **Payment: the guest chooses Paymob or pay at the hotel.** Online payment is full prepayment through Paymob's hosted checkout. While the guest pays, the inventory is held for about 15 minutes in `AWAITING_PAYMENT`; failure or timeout releases it and nothing is confirmed. Staff-created bookings are paid at the hotel only. Supersedes Q-08 | ADR 025; `Payment` tables; M9 |
| Q-38 | **Guest cancellation requests.** A guest may request cancellation online (manage link or "My reservations") until 24 hours before the branch's check-in time on the arrival date, for paid and pay-at-hotel bookings alike. A Manager (assigned branch) or an Admin approves or rejects it with a reason; the booking stays `CONFIRMED` until approved. Approval of a Paymob-paid booking asks Paymob, through its refund API, to refund the captured amount; the booking becomes `CANCELLED` when Paymob confirms. Any fee Paymob deducts follows Paymob's own policy and is not calculated by Rivana. After the deadline the guest contacts the hotel. Supersedes Q-07 | ADRs 024, 025; `CancellationRequest`; capability `cancellations:decide` |
| Q-39 | **Several rooms or apartments in one booking**, at one branch and for the same dates, with one payment, one coupon, and one VAT total. Supersedes Q-12 | Multi-line reservations; quote per line |
| Q-40 | **Track entry into the hotel system.** Each new website booking shows "Not yet in hotel system" until a receptionist marks it entered; overdue ones are highlighted and appear in the manager review. Replaces pending-age tracking (Q-11) | `pmsEnteredAt`; FR-OPS-7; target time Q-61 |
| Q-41 | **Path-based branch websites**: `/{branchSlug}/…`. With two or more active branches, `/` is a branch chooser; with one, `/` redirects to that branch. Visitors can switch branches from the header. Subdomains are not approved. Answers Q-03 | ADR 026; route map |
| Q-42 | **All public pages belong to a branch**: Home, About, Contact (with that branch's map), accommodation listings, and facilities. The logo, brand name, social links, footer and legal text, and default SEO stay shared. Every branch uses the same templates and design. Answers Q-04 | ADR 026; `Page.branchId`, `Facility.branchId` |
| Q-43 | **Rooms and hotel apartments (شقق فندقية) share one catalog.** Staff mark each listing `ROOM` or `APARTMENT`. Guest-facing navigation says "Rooms & Apartments" (or only "Rooms" or "Apartments" when the branch offers one kind); URLs are `/{branch}/stay/{slug}`; cards show a Room or Apartment badge; apartments may show bedrooms, bathrooms, and kitchen facts | ADR 026; `Room.accommodationType` |
| Q-44 | **Date-based prices stay, as one kind.** Base nightly price plus non-overlapping date periods with a different price. No `OFFER` kind and no precedence rules. Discounts are coupons. Answers Q-06 | PR-2…4 |
| Q-45 | **VAT** is one percentage for all branches, managed by Admin. Prices are authored and shown before VAT. VAT is calculated **once** on the final subtotal (all rooms after date prices, plus services, minus the coupon) and rounded half-up to the cent. The review step shows it as a separate line included in the total. Each reservation stores the rate it used. Partly answers Q-05 | ADR 027; TX-1…5 |
| Q-46 | **US dollars only.** No currency conversion or approximate-currency display. Rivana charges and displays USD | ADR 020 unchanged; no conversion feature |
| Q-47 | **Remove the public promotion popup.** The CMS promotions area is retired; coupons (Q-48) replace it | ADR 027; M5 |
| Q-48 | **Coupons**: a percentage or a fixed USD amount off; optional validity dates, optional total redemption limit, optional per-phone limit; valid at selected branches or all branches; one code per booking, applied to the whole booking (accommodation + services) before VAT. Managed by Admin, and by Managers for their branches | ADR 027; `Coupon`, `CouponRedemption` |
| Q-49 | **Optional services: breakfast and airport transportation**, each priced per branch by Manager or Admin with a **price unit** (per booking, per night, per person, or per person per night) and an optional separate child price for the person units; a branch can switch each off. Amended by the owner on 2026-11-11 (earlier text: one flat price per booking). Chosen during booking or offered as an optional cross-sell at the final review, never added without the guest's choice | ADR 027; `ServiceOffering` |
| Q-50 | **WhatsApp marketing broadcasts by Rivana** to guests who opted in to marketing. Admin, and Managers for their branches, send offers and coupon codes through approved WhatsApp marketing templates | ADR 028; consent fields; M13 |
| Q-51 | **WhatsApp feedback request after the guest leaves**, triggered by staff recording check-out in Rivana (Rivana cannot see the PMS). Guests reply in the WhatsApp chat; staff read replies in the WhatsApp Business inbox. Rivana stores no feedback | ADR 028; M13 |
| Q-52 | **Each branch shows its location as an interactive Google Map** (an embedded `google.com/maps/embed` frame), with the address and a directions link as the fallback | Branch `mapEmbedUrl`; M5 |
| Q-05 | **VAT rate on an Admin-only dashboard setting, never empty.** It starts at 15% (seeded as data, not coded in logic) and the Admin can change it to any value from 0% to 100% at any time; a value below 0 or above 100 is refused with an error; each booking keeps the rate it used. Guests see the line labelled "VAT (n%)". No other tax, service charge, or fee is modelled. Online booking is not gated on a VAT rate. Amended by the owner on 2026-11-11 (earlier text: no rate until the Admin entered one). Completes Q-45 | ADR 027; FR-TAX; `/admin/settings` (M12, setting API M7) |
| Q-54 | **The Paymob account can charge in US dollars.** Card and other methods are whatever the client's Paymob account enables; Rivana shows Paymob's hosted checkout, so it does not need to list them | ADR 025; USD-only (Q-46) holds |
| Q-55 | **The client supplies the Paymob keys when M9 starts** (sandbox first, then live for launch), sent to the developer and stored as server secrets, never in the dashboard or the repository. Until then M9 cannot run against Paymob; earlier milestones use the fake gateway | ADR 025; M9 starts when the keys arrive |
| Q-67 | **WhatsApp is configured by the Admin in the dashboard.** The client supplies the WhatsApp Business number later; until then it is an empty placeholder and WhatsApp sending stays off (online booking needs it for verification codes). The Admin enters the business number (and the provider's phone-number id) on an Admin-only WhatsApp settings screen, manages the **message templates** there (one per message purpose and language: template name as approved by Meta, language, variables mapped to booking fields, and a preview text), and presses **Send test message** to a phone of their choice to check the setup. The provider access token stays a server secret. Rivana does not submit templates to Meta for approval; the client approves them in Meta's tools and enters the approved names. Answers most of Q-10 | ADR 028; `WhatsAppSettings`, `WhatsAppTemplate`; M8 |
| Q-53 | **Confirmation messages only after the confirmed reservation commits.** Email and WhatsApp confirmations are queued in the same transaction that makes the reservation `CONFIRMED`. A failed, conflicting, expired, or unpaid booking is never called confirmed | FR-NTF-1; ADR 024 |

### Decided 2026-11-08 (M6 open)

| Id | Decision | Source and effect |
| --- | --- | --- |
| Q-09 | **Stay recommendations accepted for M6:** maximum 30 nights, check-in at most 540 days ahead, no same-day cutoff, no minimum beyond a positive stay. Each branch needs `checkInTime` before online booking can be enabled | Acceptance already recorded in the M6 brief, checked at milestone open. Existing seed data supplies New Cairo check-in `14:00` and check-out `12:00`; no times are invented for other branches |
| Q-17 | **No forced block or unit deactivation that would oversell**, including by a Manager or Admin. Move or cancel affected reservations first | Acceptance already recorded in the M6 brief, checked at milestone open; IN-6 and the inventory guard |
| Q-68 | **P5 accepts optional `unitsRequested`, default 1**, for availability of a requested number of units of each listing | Owner, 2026-11-08; completes the M6 requested-quantity contract |
| Q-69 | **Maximum 5 units per booking**, across all its listings. Adopt the existing OC-3 recommendation in M6 rather than defer the choice to M10. P5 caps `unitsAvailable` at 5 | Owner, 2026-11-08; quantity validation and disclosure in M6, whole-booking enforcement when reservations arrive |
| Q-70 | **Availability search is allowed for active branches while online booking is disabled.** Search returns inventory and accommodation prices; it neither enables booking nor bypasses the reservation readiness checks | Owner, 2026-11-08; P5 is usable before VAT and WhatsApp setup exists. Inactive or missing branches still return 404 |

## Superseded decisions

Kept as the record of the earlier approved design (accepted M1–M3 documents and ADRs describe them).

| Id | Earlier decision (2026-10-24) | Superseded by |
| --- | --- | --- |
| Q-02 | Request to book: website reservations are `PENDING` and hold inventory until a receptionist confirms or declines after checking the hotel system | Q-36 (2026-11-06) |
| Q-07 | Guests may cancel only `PENDING` requests online; `CONFIRMED` reservations are cancelled by contacting the hotel | Q-38 (2026-11-06) |
| Q-08 *(was open)* | Recommendation: pay at the hotel only; online payment is a separate project | Q-37 (2026-11-06) |
| Q-11 *(was open)* | Recommendation: no auto-expiry of pending requests; highlight after 4 working hours | Q-40 (2026-11-06); `PENDING` no longer exists |
| Q-12 *(was open)* | Recommendation: one room per reservation in v1 | Q-39 (2026-11-06) |
| Q-03, Q-04, Q-06 *(were open)* | Path-based branch URLs for booking only; no branch-specific content; `OFFER` over `SEASONAL` precedence | Q-41, Q-42, Q-44 (2026-11-06) |

## Decisions requiring approval

| Id | Question | Recommendation | Blocks |
| --- | --- | --- | --- |
| Q-10 | WhatsApp provider (rest of the earlier question): Meta WhatsApp Cloud API directly, or a provider such as Twilio; who completes Meta business verification and template approval. The number and templates themselves are now Admin-managed (Q-67), so Arabic templates can be added whenever wanted | Meta Cloud API directly, with the client completing business verification; the adapter stays swappable | M8 |
| Q-15 | Audit CMS content changes too? | Later. Reservation, pricing, coupon, payment, inventory, and access first; CMS edits keep `updatedById` | M12 |
| Q-18 | Reinstating cancelled reservations, undoing check-in | Not in v1 (create a new reservation instead) | M8 |
| Q-19 | When staff change dates or units, are changed nights re-priced at current rates? | Yes, with old and new totals shown (including VAT), and manager override possible. For paid bookings see Q-66 | M8 |
| Q-21 | Name of the hotel's operational system (PMS), and can it export daily arrival or booking reports? | Needed for the reconciliation procedure; informational | M15 |
| Q-22 | Child age definition and infant policy | Use the existing adult and child counts; policy text from the client | M10 |
| Q-23 | Actual physical room and apartment numbers per listing and branch | Data from the client before go-live | M15 |
| Q-24 | Staff list with roles and branch assignments | Data from the client before go-live | M15 |
| Q-25 | Where PostgreSQL runs | On the Hostinger VPS by default, or a managed service; choose in Phase 12; must meet ADR 022 requirements | M15 |
| Q-26 | May receptionists and managers read and manage contact enquiries? | Yes (front-desk work), limited to enquiries sent from their branches' contact pages | M4 |
| Q-30 | Guest-facing text: privacy notice (phone verification, indefinite retention, Paymob as processor, WhatsApp provider), cancellation and refund terms, marketing consent wording | Client-approved text before launch | M10 |
| Q-33 | Should Admins and Managers use a second sign-in step (authenticator app) before launch? They now approve refunds | Yes (Better Auth two-factor plugin; no custom crypto) | M14 |
| Q-34 | Should contact-form enquiries also be kept permanently, like guest data? | Owner to decide; today the proposal is to purge archived enquiries after 12 months | M15 |
| Q-35 | Should Managers also get the sync pop-up, or only Receptionists? | Only Receptionists; Managers see overdue branches on the overview | M11 |
| Q-56 | Service details: approved prices per branch; **which price unit each service uses at each branch, the adult and child prices, and whether children are charged for each service (owner added 2026-11-11, staff enter these as data, nothing is coded)**; whether airport transfer needs flight number, arrival time, or direction (arrival, departure, both); whether services can be added after booking; whether staff bookings can include services | No example price is used; transfer asks for an optional flight number and arrival time as plain text; no post-booking add-on in v1; staff bookings can include services | M7 |
| Q-57 | Coupon details: does a cancelled or expired booking give its redemption back; are codes case-insensitive; minimum nights or amount; usable on staff bookings; may a fixed amount exceed the subtotal | Redemption is released when the booking is cancelled or its payment fails; codes are case-insensitive; no minimums; staff bookings may use codes; a fixed amount is capped at the subtotal (never below zero) | M7 |
| Q-58 ★ | Marketing consent and broadcasts: consent wording, where it is collected (an unticked checkbox at booking is proposed), opt-out (reply STOP, plus staff can record it), audience filters, frequency limits, Meta marketing template approval, per-message cost | Unticked opt-in at booking, stored with its wording version; opt-out honored immediately; at most one broadcast per guest per 7 days; broadcasts only to opted-in, non-blocked guests | M13 |
| Q-59 | Feedback request: delay after recorded check-out, template text, Meta template category, one per stay or per guest | A few hours after check-out (proposed 3 hours, inside daytime hours), once per reservation, utility template if Meta accepts it | M13 |
| Q-60 ★ | Anti-squatting limits now that pay-at-hotel website bookings are confirmed at once: how many upcoming unpaid website bookings may one phone hold, and how many open payment holds? | At most 2 upcoming pay-at-hotel website bookings and 1 open payment hold per phone; per-client rate limits as designed | M8 |
| Q-61 | Target time for entering a new website booking into the PMS, and the night-time rule | 30 minutes during staffed hours; bookings made overnight are entered at the start of the morning shift | M11 |
| Q-62 ★ | Staff cancellation of a Paymob-paid booking: who may do it, and does it always refund in full? | Only Manager and Admin (receptionists cancel unpaid bookings only); it always refunds the captured amount through Paymob, like an approved request | M9 |
| Q-63 | Payment success that arrives after the 15-minute hold expired | Confirm it if the inventory is still free (re-checked under the lock); otherwise refund automatically and tell the guest and staff | M9 |
| Q-64 | Bookings made within 24 hours of check-in: no online cancellation is ever possible. Is that acceptable, and what does the guest see? | Yes; the review step says so before payment | M10 |
| Q-65 ★ | No-show policy: for pay-at-hotel bookings, and for prepaid bookings (is any amount refunded?) | No automatic refund for a prepaid no-show; staff may cancel with a refund under Q-62. Policy text from the client | M9 |
| Q-66 ★ | Staff modification of a prepaid booking that changes its total (dates, units, services) | v1: the difference is settled at the hotel desk (collected, or returned in cash by hotel policy); no partial Paymob refunds | M9 |

## Client scope document v2.0

The client-facing scope ([../delivery/Rivana_Residence_Project_Scope_v2.pdf](../delivery/Rivana_Residence_Project_Scope_v2.pdf), source [client-scope-v2.html](../delivery/client-scope-v2.html), sent for approval on 2026-10-24) is a historical record and is not edited. The 2026-11-06 decisions answer or replace several of its questions: Q-05, Q-10 (number, templates, Arabic), Q-08, Q-11, Q-12, Q-03, Q-04, and Q-06. Its section 16 lists the 2026-10-24 decisions, including Q-02 and Q-07, which are now superseded. A revised client scope document should be prepared before M4 starts. Its section 17 numbers map to the ids above:

| PDF # | Id | PDF # | Id | PDF # | Id |
| --- | --- | --- | --- | --- | --- |
| 1 | Q-05 | 8 | Q-06 | 15 | Q-15 |
| 2 | Q-08 | 9 | Q-19 | 16 | Q-26 |
| 3–4 | Q-09 | 10 | Q-17 | 17 | Q-34 |
| 5 | Q-10 (Arabic) | 11 | Q-18 | 18 | Q-33 |
| 6 | Q-11 | 12 | Q-22 | 19 | Q-35 |
| 7 | Q-12 | 13 | Q-03 | | |
| | | 14 | Q-04 | | |

## Assumptions in use

| Id | Assumption | Confidence | If wrong |
| --- | --- | --- | --- |
| A-1 | One property today (New Cairo); the three CMS rooms are its room listings | High (seed data, website) | Migration assigns them to the wrong branch, which Admin can fix while no inventory exists |
| A-2 | Guests book a listing (a room type or apartment type), not a specific numbered unit | High (hotel practice) | Assignment at booking is possible with the same tables |
| A-3 | Accommodation is priced per unit per night, regardless of guest count | Medium (PDF examples) | Add occupancy-based pricing to `PriceResolver` |
| A-4 | One currency, US dollars, for all branches and for Paymob (Q-46, Q-54) | High (confirmed 2026-11-06) | — |
| A-5 | The PMS has no API or export we can use automatically | High (brief) | Implement a `HotelSystemSync` adapter |
| A-6 | Staff are present daily to enter website bookings into the PMS and to record external bookings | Medium | Cross-system conflicts become more likely (RK-1) |
| A-7 | SMTP, a WhatsApp Business sender, and a Paymob merchant account will be configured for production | Medium | Without WhatsApp no guest can verify, so online booking stays off; without Paymob only pay-at-hotel is offered; without SMTP guests rely on WhatsApp messages |
| A-8 | The production database will be PostgreSQL 17+ with `btree_gist` | Medium | ADR 022 fallback |
| A-9 | The scope PDF was never signed; the current brief and the decisions above override it where they differ | High | Revisit the traceability matrix |
| A-10 | Paymob's hosted checkout can carry Rivana's reservation reference, can expire a payment session, sends HMAC-signed transaction callbacks, and offers a refund API | Medium (Paymob documentation to be verified in M9) | Adjust ADR 025 before M9 |
