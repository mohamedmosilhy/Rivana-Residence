# Overview

Rivana Residence is a hotel business in New Cairo, with more branches planned. This repository is its single Next.js application: the public website, the staff dashboard, and the API.

## What the product does

| Capability | For | Status |
| --- | --- | --- |
| **Website**: home, about, rooms, facilities, contact, promotions popup, SEO | Guests and visitors | Implemented |
| **Content management**: pages, rooms, facilities, media, promotions, enquiries, settings, staff accounts | Admin, Editor | Implemented |
| **Online booking**: choose a branch, dates, and guests; see real availability and price in US dollars; verify your phone with a WhatsApp code; request a stay; get messages by email and WhatsApp; see your bookings with phone and code | Guests | Planned (M5–M8) |
| **Front desk**: confirm or decline requests, take phone and walk-in bookings, record bookings from the hotel's system, sync with the hotel's system every 30 minutes (sound and pop-up reminder), block rooms, check guests in and out | Receptionist | Planned (M6–M9) |
| **Management**: prices and offers, on-screen occupancy and revenue statistics, audit history, blocking phone numbers that make fake bookings | Manager | Planned (M6–M10) |
| **Administration**: branches (including the sync reminder interval), staff roles and branch assignments, settings, blocking phone numbers | Admin | Partly implemented (settings, staff) |

Everything runs in one deployable application with one database, one sign-in, and one design system ([architecture/overview.md](./architecture/overview.md)).

## How the scope came together

1. The website and content management were specified and built first (Phases 0–11), with Book Now reserved for an external hotel-management provider's booking module.
2. The provider then promised an availability and reservation API instead (the [scope PDF](./source/Rivana_Residence_Project_Scope.pdf), August 2026).
3. Neither arrived, so Rivana now runs reservations itself ([ADR 013](./adr/013-self-managed-reservations.md)). The rooms, media, auth, dashboard, and design built in Phases 0–11 are the foundation the reservation features extend.

## The one limitation everyone must know

The hotel's own operational system (PMS) is **not connected** to Rivana. Staff keep the two in step by hand. Rivana can prevent double bookings **only among reservations recorded in Rivana**; a booking that exists only in the hotel's system can collide with a website booking until staff record it. That is why website bookings are requests that staff confirm after checking the hotel's system (decided, Q-02), and why daily procedures keep the systems aligned ([operations/manual-synchronization-procedure.md](./operations/manual-synchronization-procedure.md), [operations/known-limitations.md](./operations/known-limitations.md)).

## Status

- Phases 0–11 accepted (Phases 0–10 on 2026-09-25/26, Phase 11 on 2026-10-24).
- Reservation milestones M0–M3 (discovery, requirements, design, agent setup) accepted (2026-10-24); M4 onward not started, waiting for the client's reply to scope v2.0.
- Launch: the website and reservations go live together (Phase 12 + M12, decision Q-16).

The full plan is [delivery/roadmap.md](./delivery/roadmap.md); open decisions are in [requirements/assumptions-and-open-questions.md](./requirements/assumptions-and-open-questions.md).
