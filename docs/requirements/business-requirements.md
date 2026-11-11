# Business requirements

Sources: the current brief ([../source/prompt.md](../source/prompt.md), 2026-10-24), the client decisions of 2026-11-06 ([assumptions-and-open-questions.md](./assumptions-and-open-questions.md#decided-2026-11-06-client-decisions)), the scope PDF ([../source/Rivana_Residence_Project_Scope.pdf](../source/Rivana_Residence_Project_Scope.pdf), v1.0, 15 August 2026, never signed), and the client approvals recorded in [../delivery/roadmap.md](../delivery/roadmap.md).

## Product

Rivana Residence is a hotel business in New Cairo, with more branches planned. The product is one website and one staff dashboard:

- a **public website** with one site per branch (its own text, images, rooms and apartments, facilities, contact, and map, on shared templates), a branch chooser when more than one branch is active, and online booking that confirms immediately, with payment online through Paymob or at the hotel;
- a **content management system** that lets staff run each branch's text, images, listings, and facilities without developers;
- a **reservation system** that manages branches, physical units, prices, optional services, coupons, VAT, availability, reservations, payments, refunds, and guest messages, with tools for receptionists, managers, and administrators.

The hotel also runs its own operational system (PMS). It is not connected to Rivana; staff keep the two in step by hand ([../operations/manual-synchronization-procedure.md](../operations/manual-synchronization-procedure.md)).

## How the scope evolved

| Plan | Assumption | Outcome |
| --- | --- | --- |
| A | Website and CMS built by us; an external provider supplies the booking module behind Book Now | Website and CMS built and accepted (Phases 0–10). The module never arrived |
| B | Our booking screens call the provider's availability and reservation API (scope PDF §4) | The API never arrived |
| Current (2026-10-24) | Rivana manages reservations itself, with manual synchronization with the PMS; website bookings are requests | Design accepted in M1–M3 |
| Current (2026-11-06) | Same, but website bookings confirm immediately, guests may pay online (Paymob), and each branch has its own website | This requirements set |

## Business goals

| Id | Goal |
| --- | --- |
| BG-1 | Let guests book a stay online at a chosen branch and receive an immediate confirmation, with correct availability, price, and VAT, paying online or at the hotel. |
| BG-2 | Give receptionists one place to see, record, and run reservations per branch, and to keep the hotel system in step. |
| BG-3 | Give managers occupancy and reservation statistics for their branches, and control of prices. |
| BG-4 | Present Rivana as a modern luxury residence that is fast, accessible, and easy to find in search, while keeping its plum-and-gold identity. |
| BG-5 | Minimize double bookings between Rivana and the hotel's operational system despite there being no integration. |
| BG-6 | Be ready to plug in a real integration later without rewriting the reservation core. |
| BG-7 | Let non-technical staff manage each branch's website content and images without developer help. |
| BG-8 | Let managers drive repeat business with coupons and consented WhatsApp offers, and collect feedback after stays. |

## Business requirements

### Website and content

| Id | Requirement | Source | Status |
| --- | --- | --- | --- |
| BR-13 | The website presents the property, rooms, facilities, location, and contact options, keeping the existing design identity. | PDF §1 | Implemented |
| BR-14 | Staff edit website text, images, page sections, rooms, facilities, contact details, and SEO from the dashboard. | PDF §1–2 | Implemented |
| BR-15 | ~~Staff publish time-bounded promotion campaigns that show a code on the website (marketing only).~~ Retired by the client (Q-47, 2026-11-06); replaced by BR-25 | PDF §3 | Implemented; removal planned (M5) |
| BR-22 | Each branch has its own website content (text, images, listings, facilities, contact, map) on shared templates; visitors choose and switch branches, and the choice carries into booking. | Client 2026-11-06 (Q-41, Q-42, Q-52) | Planned (M4–M5) |
| BR-23 | A branch may offer guest rooms, hotel apartments, or both, managed and booked through one catalog and one booking flow, labelled honestly. | Client 2026-11-06 (Q-43) | Planned (M4–M5) |
| BR-16 | Visitors can send an enquiry through a contact form; staff read and archive enquiries. | PDF §1 | Implemented |
| BR-17 | The website meets accessibility (WCAG 2.2 AA), performance, and SEO standards on phones and desktops. | Brief §14 | Implemented |

### Reservations

| Id | Requirement | Source | Status |
| --- | --- | --- | --- |
| BR-1 | Multiple branches, each with its own website content, rooms and apartments, prices, services, availability, contact information, map, and staff. | PDF §8; brief §6 | Planned |
| BR-2 | Customers select a branch and dates; see only the rooms and apartments available for that branch and range, with prices before VAT; choose one or more units; enter their details; add optional services and a coupon; review the price with VAT; choose Paymob or pay at hotel; and submit. | PDF §4; brief §5C; client 2026-11-06 | Planned |
| BR-3 | A successful booking is confirmed immediately (on submission for pay at hotel, on verified payment for Paymob), and the guest receives a reference and confirmation by email and WhatsApp after it is committed. | PDF §4–5; client 2026-11-06 (Q-36, Q-53) | Planned |
| BR-4 | Accommodation prices are per unit per night in US dollars, authored before VAT, with date-specific prices applied automatically by stay date. | PDF §2–3; owner 2026-10-24; client 2026-11-06 (Q-44, Q-46) | Planned |
| BR-5 | Receptionists view reservations, guest information, and availability; create reservations for guests; record reservations taken in the hotel system; mark website bookings as entered in the hotel system; and manage maintenance blocks. They cannot change prices, coupons, services, settings, or website content. | PDF §7; brief §7; client 2026-11-06 | Planned |
| BR-6 | Managers have receptionist abilities for their branches, plus prices, services, coupons, cancellation and refund decisions, WhatsApp broadcasts, and statistics. | PDF §7; client 2026-11-06 | Planned |
| BR-24 | Guests may pay online through Paymob or pay at the hotel. Guests may request cancellation until 24 hours before check-in; a Manager or Admin approves, and paid bookings are refunded through Paymob. | Client 2026-11-06 (Q-37, Q-38) | Planned (M9) |
| BR-25 | Admin and Managers create coupon codes (percentage or fixed USD) that guests enter during booking and that change the quote and total. | Client 2026-11-06 (Q-48) | Planned (M7) |
| BR-26 | VAT is calculated on the final subtotal and shown separately at the final review; Admin manages the single VAT percentage. | Client 2026-11-06 (Q-45) | Planned (M7) |
| BR-27 | Guests may add breakfast and airport transportation, each priced by a configurable unit (per booking, per night, per person, or per person per night, with an optional child price), and are offered them at the review if not chosen; nothing is added without their choice. | Client 2026-11-06 (Q-49) | Planned (M7) |
| BR-28 | Rivana sends WhatsApp offers and codes to guests who opted in, and a WhatsApp feedback request after staff record check-out. | Client 2026-11-06 (Q-50, Q-51) | Planned (M13) |
| BR-10 | Statistics: number of reservations, confirmed, cancelled, occupancy, listing performance, revenue excluding VAT where data exists, VAT, discounts, online payments and refunds, and trends over periods. | PDF §10 | Planned |
| BR-11 | The limitation of manual synchronization is documented and visible to staff, and procedures reduce its risk. Receptionists are reminded by sound and pop-up to sync every 30 minutes (Admin-configurable per branch). Because website bookings confirm immediately without checking the PMS (Q-36), each one stays flagged until staff enter it in the hotel system. | Brief §4, §22; owner 2026-10-24; client 2026-11-06 | Planned |
| BR-18 | Online bookings require a phone number verified by a one-time code sent by WhatsApp, so fake reservations are hard to make. | PDF §5; owner 2026-10-24 | Planned |
| BR-19 | Rivana keeps one guest profile per verified phone number, with booking history for staff. Admin and Manager can block a number so it can no longer book online. | PDF §6–7; owner 2026-10-24 | Planned |
| BR-20 | Guests receive booking, payment, and cancellation messages by email and WhatsApp. | PDF §5; owner 2026-10-24 | Planned |

### Access and governance

| Id | Requirement | Source | Status |
| --- | --- | --- | --- |
| BR-7 | Admins have full access: content, branches, staff accounts and roles, VAT, and settings. | PDF §7 | Partly implemented (content, staff) |
| BR-8 | Content management stays with Admin and the CMS-only Editor role (Q-01). Reservation roles never gain content permissions. | Brief §5B, §7 | Implemented for Editor and Admin |
| BR-9 | Important management actions are recorded: who changed prices, services, coupons, or VAT, edited or cancelled reservations, decided cancellation requests, issued refunds, changed inventory, blocked a number, sent a broadcast, recorded a sync or a hotel-system entry, or changed access. | PDF §9 | Planned |
| BR-21 | Guest and reservation data is kept indefinitely; there is no automatic deletion. | Owner 2026-10-24 (Q-13) | Planned |
| BR-12 | No password-based customer accounts, loyalty, currency conversion, CSV exports, partial refunds, or payment methods other than Paymob and pay at hotel unless approved separately. Payment, VAT, coupons, and WhatsApp marketing are in scope only as defined above (2026-11-06). | Brief §5; owner 2026-10-24; client 2026-11-06 | — |

## Out of scope (candidates for later approval)

- Payment providers other than Paymob, deposits, partial refunds, and payment links for staff bookings (Q-37, Q-66).
- Currency conversion or approximate prices in other currencies (Q-46: US dollars only).
- Customer accounts with passwords or profile pages, and loyalty offers (PDF §6). Verified phone profiles cover verification, history, and blocking (Q-27).
- SMS verification (WhatsApp only, Q-28).
- CSV or spreadsheet export of statistics (Q-14).
- Storing guest feedback in Rivana (replies stay in WhatsApp, Q-51).
- Branch subdomains (Q-41: path-based URLs).
- Automated PMS integration (ADR 013).
- A generic drag-and-drop page builder, or a different design per branch.
- Multilingual content in the first release. The model must not prevent a later locale strategy.
- Terms & Conditions and Cancellation/Refund pages (PDF §1), until the client supplies approved text. They are then ordinary CMS pages per branch.

Also never allowed: mock booking or payment success states, a confirmation before the reservation is committed (and, for Paymob, paid), invented prices, VAT rates, or availability calendars (the dollar prices and calendars in the reference HTML are design placeholders), and any claim of real-time synchronization with the PMS or that a Rivana confirmation was checked against it.

## Success measures (proposed)

- No oversold room-nights inside Rivana, verified by tests and by reconciliation reports.
- Every confirmed website booking entered in the hotel system within the agreed time (proposed: 30 minutes during staffed hours; Q-61).
- Cancellation requests decided before the guest's arrival, and refunds completed by Paymob.
- Every external reservation recorded within the agreed time after it enters the PMS (proposed: 30 minutes during staffed hours).
- Lighthouse budgets and accessibility checks stay green on every release ([../testing/testing-strategy.md](../testing/testing-strategy.md)).
