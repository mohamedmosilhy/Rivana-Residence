# Business requirements

Sources: the current brief ([../source/prompt.md](../source/prompt.md), 2026-10-24), the scope PDF ([../source/Rivana_Residence_Project_Scope.pdf](../source/Rivana_Residence_Project_Scope.pdf), v1.0, 15 August 2026, never signed), and the client approvals recorded in [../delivery/roadmap.md](../delivery/roadmap.md).

## Product

Rivana Residence is a hotel business in New Cairo, with more branches planned. The product is one website and one staff dashboard:

- a **public website** that presents each branch, its rooms and facilities, and lets guests request a stay online;
- a **content management system** that lets staff run the website's text, images, rooms, facilities, and promotions without developers;
- a **reservation system** that manages branches, physical rooms, prices, availability, and reservations, with tools for receptionists, managers, and administrators.

The hotel also runs its own operational system (PMS). It is not connected to Rivana; staff keep the two in step by hand ([../operations/manual-synchronization-procedure.md](../operations/manual-synchronization-procedure.md)).

## How the scope evolved

| Plan | Assumption | Outcome |
| --- | --- | --- |
| A | Website and CMS built by us; an external provider supplies the booking module behind Book Now | Website and CMS built and accepted (Phases 0–10). The module never arrived |
| B | Our booking screens call the provider's availability and reservation API (scope PDF §4) | The API never arrived |
| Current | Rivana manages reservations itself, with manual synchronization with the PMS | This requirements set |

## Business goals

| Id | Goal |
| --- | --- |
| BG-1 | Let guests request a stay online at a chosen branch, with correct availability and price. |
| BG-2 | Give receptionists one place to see, confirm, record, and run reservations per branch. |
| BG-3 | Give managers occupancy and reservation statistics for their branches, and control of prices. |
| BG-4 | Present Rivana as a modern luxury residence that is fast, accessible, and easy to find in search, while keeping its plum-and-gold identity. |
| BG-5 | Minimize double bookings between Rivana and the hotel's operational system despite there being no integration. |
| BG-6 | Be ready to plug in a real integration later without rewriting the reservation core. |
| BG-7 | Let non-technical staff manage all website content, images, and promotions without developer help. |

## Business requirements

### Website and content

| Id | Requirement | Source | Status |
| --- | --- | --- | --- |
| BR-13 | The website presents the property, rooms, facilities, location, and contact options, keeping the existing design identity. | PDF §1 | Implemented |
| BR-14 | Staff edit website text, images, page sections, rooms, facilities, contact details, and SEO from the dashboard. | PDF §1–2 | Implemented |
| BR-15 | Staff publish time-bounded promotion campaigns that show a code on the website (marketing only). | PDF §3 | Implemented |
| BR-16 | Visitors can send an enquiry through a contact form; staff read and archive enquiries. | PDF §1 | Implemented |
| BR-17 | The website meets accessibility (WCAG 2.2 AA), performance, and SEO standards on phones and desktops. | Brief §14 | Implemented |

### Reservations

| Id | Requirement | Source | Status |
| --- | --- | --- | --- |
| BR-1 | Multiple branches, each with its own rooms, prices, availability, contact information, and staff. | PDF §8; brief §6 | Planned |
| BR-2 | Customers select a branch, dates, and guests; see available room types with the applicable price; enter their details; and submit a reservation. | PDF §4; brief §5C | Planned |
| BR-3 | Customers receive a reservation reference and confirmation communication. | PDF §4–5 | Planned |
| BR-4 | Prices are per room per night in US dollars, with date-specific and offer prices applied automatically by stay date. | PDF §2–3; owner 2026-10-24 | Planned |
| BR-5 | Receptionists view, accept, and decline reservations; view guest information and availability; create reservations for guests; record reservations taken in the hotel system; and manage maintenance blocks. They cannot change prices, system settings, or website content. | PDF §7; brief §7 | Planned |
| BR-6 | Managers have receptionist abilities for their branches, plus price management and statistics. | PDF §7 | Planned |
| BR-10 | Statistics: number of reservations, confirmed, cancelled/declined, occupancy, room performance, revenue where data exists, and trends over periods. | PDF §10 | Planned |
| BR-11 | The limitation of manual synchronization is documented and visible to staff, and procedures reduce its risk. Receptionists are reminded by sound and pop-up to sync every 30 minutes (Admin-configurable per branch). | Brief §4, §22; owner 2026-10-24 | Planned |
| BR-18 | Online bookings require a phone number verified by a one-time code sent by WhatsApp, so fake reservations are hard to make. | PDF §5; owner 2026-10-24 | Planned |
| BR-19 | Rivana keeps one guest profile per verified phone number, with booking history for staff. Admin and Manager can block a number so it can no longer book online. | PDF §6–7; owner 2026-10-24 | Planned |
| BR-20 | Guests receive booking messages by email and WhatsApp. | PDF §5; owner 2026-10-24 | Planned |

### Access and governance

| Id | Requirement | Source | Status |
| --- | --- | --- | --- |
| BR-7 | Admins have full access: content, branches, staff accounts and roles, and settings. | PDF §7 | Partly implemented (content, staff) |
| BR-8 | Content management stays with Admin and the CMS-only Editor role (Q-01). Reservation roles never gain content permissions. | Brief §5B, §7 | Implemented for Editor and Admin |
| BR-9 | Important management actions are recorded: who changed prices, edited reservations, changed inventory, blocked a number, recorded a sync, or changed access. | PDF §9 | Planned |
| BR-21 | Guest and reservation data is kept indefinitely; there is no automatic deletion. | Owner 2026-10-24 (Q-13) | Planned |
| BR-12 | No payment processing, password-based customer accounts, loyalty, tax rules, CSV exports, or marketing campaigns unless approved separately. WhatsApp is used for verification codes and booking messages only. | Brief §5; owner 2026-10-24 | — |

## Out of scope (candidates for later approval)

- Online payment (Stripe, Paymob). Reservations store `PAY_AT_HOTEL` (PDF §4; Q-08).
- Customer accounts with passwords or profile pages, and loyalty offers (PDF §6). Verified phone profiles cover verification, history, and blocking (Q-27).
- SMS verification (WhatsApp only, Q-28) and marketing messages.
- CSV or spreadsheet export of statistics; the hotel's operational system already provides exports (Q-14).
- Promotion-code discounts or redemption. Promotions only advertise a code.
- Branch subdomains (PDF §8 example; Q-03), and branch-specific pages, facilities, and promotions (Q-04).
- Automated PMS integration (ADR 013).
- A generic drag-and-drop page builder.
- Multilingual content in the first release. The model must not prevent a later locale strategy.
- Terms & Conditions and Cancellation/Refund pages (PDF §1), until the client supplies approved text. They are then ordinary CMS pages.

Also never allowed: mock booking success states, invented prices or availability calendars (the dollar prices and calendars in the reference HTML are design placeholders), and any claim of real-time synchronization with the PMS.

## Success measures (proposed)

- No oversold room-nights inside Rivana, verified by tests and by reconciliation reports.
- Pending website requests confirmed or declined within the agreed time (proposed: 4 working hours; Q-11).
- Every external reservation recorded within the agreed time after it enters the PMS (proposed: 30 minutes during staffed hours).
- Lighthouse budgets and accessibility checks stay green on every release ([../testing/testing-strategy.md](../testing/testing-strategy.md)).
