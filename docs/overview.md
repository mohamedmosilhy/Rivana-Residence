# Overview

Rivana Residence is a hotel business in New Cairo, with more branches planned. This repository is its single Next.js application: the public website, the staff dashboard, and the API.

## What the product does

| Capability | For | Status |
| --- | --- | --- |
| **Website**: home, about, rooms, facilities, contact, promotions popup, SEO | Guests and visitors | Implemented (single site). The popup is retired and removed in M5 |
| **Branch websites**: a branch chooser when more than one branch is active; each branch's own pages, rooms and apartments, facilities, contact, and interactive Google Map on shared templates; a branch switcher | Guests and visitors | Planned (M4–M5) |
| **Content management**: pages, rooms and apartments, facilities, media, enquiries, settings, branches, staff accounts | Admin, Editor | Implemented; per-branch editing, Room or Apartment listings, and the branch admin since M5 (promotions removed) |
| **Online booking**: on a branch's site, choose dates and guests; see only available rooms and apartments with prices before VAT in US dollars; book one or more units; verify your phone with a WhatsApp code; add breakfast or airport transfer and a coupon; review the total with VAT; pay online with Paymob or at the hotel; get an **immediate confirmation** by email and WhatsApp; see your bookings with phone and code; request cancellation until 24 hours before check-in | Guests | Planned (M6–M10) |
| **Front desk**: enter each confirmed website booking into the hotel's system and mark it entered, take phone and walk-in bookings, record bookings from the hotel's system, sync every 30 minutes (sound and pop-up reminder), block units, check guests in and out | Receptionist | Planned (M8–M11) |
| **Management**: prices, breakfast and transfer prices, coupon codes, cancellation decisions and Paymob refunds, WhatsApp offers to opted-in guests, on-screen statistics, audit history, blocking phone numbers | Manager | Planned (M6–M13) |
| **Administration**: branches (content, map, check-in time, online booking, sync reminder interval), staff roles and branch assignments, the VAT rate, WhatsApp number and message templates with a test message, settings, blocking phone numbers | Admin | Partly implemented (settings, staff) |

Everything runs in one deployable application with one database, one sign-in, and one design system ([architecture/overview.md](./architecture/overview.md)).

## How the scope came together

1. The website and content management were specified and built first (Phases 0–11), with Book Now reserved for an external hotel-management provider's booking module.
2. The provider then promised an availability and reservation API instead (the [scope PDF](./source/Rivana_Residence_Project_Scope.pdf), August 2026).
3. Neither arrived, so Rivana now runs reservations itself ([ADR 013](./adr/013-self-managed-reservations.md)). The rooms, media, auth, dashboard, and design built in Phases 0–11 are the foundation the reservation features extend.

## The one limitation everyone must know

The hotel's own operational system (PMS) is **not connected** to Rivana. Staff keep the two in step by hand. Rivana can prevent double bookings **only among reservations recorded in Rivana**; a booking that exists only in the hotel's system can collide with a website booking until staff record it. The client has decided that website bookings are **confirmed immediately** (Q-36, 2026-11-06), so Rivana's confirmation is never checked against the hotel's system. That raises the risk of a cross-system double booking whenever manual sync is late: a guest may hold a confirmation, and may have paid, for a room the hotel already sold. Staff therefore enter every website booking into the hotel's system promptly and mark it entered, sync every 30 minutes, and follow a conflict procedure; an Admin can switch online booking off per branch ([operations/manual-synchronization-procedure.md](./operations/manual-synchronization-procedure.md), [operations/known-limitations.md](./operations/known-limitations.md)).

## Status

- Phases 0–11 accepted (Phases 0–10 on 2026-09-25/26, Phase 11 on 2026-10-24).
- Reservation milestones M0–M3 (discovery, requirements, design, agent setup) accepted (2026-10-24).
- Client decisions of 2026-11-06 (immediate confirmation, Paymob payment and refunds, branch websites, rooms and apartments, services, coupons, VAT, WhatsApp messaging, popup removal) are recorded in ADRs 024–028 and the question register; the forward plan was replanned as M4–M15 ([milestone briefs](./delivery/milestones/README.md)). The plan was approved by the project owner on 2026-11-06; M4 onward not started.
- Launch: the branch websites and reservations go live together (Phase 12 + M15, decision Q-16).

The full plan is [delivery/roadmap.md](./delivery/roadmap.md); open decisions are in [requirements/assumptions-and-open-questions.md](./requirements/assumptions-and-open-questions.md).
