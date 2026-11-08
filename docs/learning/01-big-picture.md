# 1. Big picture

## What it is
One Next.js app for a hotel business in New Cairo (more branches planned) that does three jobs:
1. **Public website** per branch. Built.
2. **Staff dashboard and CMS** (`/admin`): pages, rooms, media, enquiries, settings, staff, branches. Built.
3. **Reservation system**: online booking, front desk, Paymob payments, WhatsApp, coupons. **Not built** (M6–M14).

## Why a reservation system
The hotel's PMS provider never delivered an API, so Rivana builds reservations itself (ADR 013). Phases 0–11 are the foundation.

## The limitation everyone must know
Rivana is **not connected to the PMS**; staff sync by hand. Rivana prevents double bookings only among bookings recorded in Rivana. Website bookings confirm immediately (client decision Q-36), so a guest can hold a confirmation (maybe paid) for a room the PMS already sold. Mitigations: enter every website booking into the PMS promptly and mark it entered, sync every 30 minutes, a conflict procedure, and an Admin can switch online booking off per branch.

## Architecture in one paragraph
Modular monolith: one deployable, one PostgreSQL, one login, one design system. Four layers, dependencies point inward: presentation (`src/app`, `src/presentation`), application (use cases, authorization), domain (pure rules), infrastructure (Prisma, SMTP, auth), wired only in `src/composition`. Lint rules and tests enforce it. Booking correctness comes from PostgreSQL locks, transactions and constraints.

## Roadmap position
- Phases 0–11 done (website, CMS, auth, media, SEO, security).
- M0–M3 done (requirements, design, agent setup). M4 (backend foundations) and M5 (branch websites, rooms and apartments) done.
- M6–M14 not started: inventory, quote, reservations, payments, booking journey, staff tools, messaging, hardening. Phase 12 + M15 = joint launch.

## Remember
1. Built: website + CMS. Not built: everything about booking.
2. Four layers; business rules never in pages or route handlers.
3. Double booking is prevented in the database, only within Rivana's own data.
