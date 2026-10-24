# Route map

Every route in the application, with its status. Pages live in `src/app`. Public pages share the `(marketing)` layout (header, footer, fonts, CSP). Staff pages share the `/admin` shell, whose navigation shows only destinations the signed-in role may use (`src/presentation/admin/navigation.ts`); each page also checks its capability on the server.

## Public website

| Route | Purpose | Status |
| --- | --- | --- |
| `/` | Home | Implemented |
| `/about` | About | Implemented |
| `/rooms` | Room listing (filterable by branch once more than one is active) | Implemented; branch filter planned (M5) |
| `/rooms/[slug]` | Room detail; Book Now opens `/book/[branch]/[room]` when the room is bookable online (IN-4), otherwise the disabled Book Now | Implemented; booking link planned (M8) |
| `/facilities` | Facility index | Implemented |
| `/facilities/[slug]` | Facility detail (Gym is `fitness-room`, Swimming Pool is `swimming-pool`) | Implemented |
| `/contact` | Contact details, map, enquiry form | Implemented |
| Legacy `*.html` paths | Permanent redirects to the routes above (`next.config.ts`) | Implemented |
| `/book` | Branch selection; goes straight to the branch when only one is bookable | Planned (M8) |
| `/book/[branchSlug]?checkIn&checkOut&adults&children` | Search form plus results; a plain GET form that works without JavaScript and is shareable | Planned (M8) |
| `/book/[branchSlug]/[roomSlug]?checkIn&…` | Quote, guest details, review, submit (`POST /api/v1/reservations`) | Planned (M8) |
| `/reservations/manage` | Guest manage page; reads the token from `#t=` and calls `GET /api/v1/guest/reservation` | Planned (M8) |
| `/reservations/find` | "My reservations": phone number plus WhatsApp code, then the list of that number's reservations (30 minutes) | Planned (M8) |

## Staff dashboard

| Route | Capability | Purpose | Status |
| --- | --- | --- | --- |
| `/admin/login` | — | Staff sign-in | Implemented |
| `/admin` | `admin:access` | Overview; adds today's desk widgets per assigned branch for reservation roles | Implemented; desk widgets planned (M9) |
| `/admin/pages`, `/admin/pages/[key]` (+ `/preview`) | `content:edit` | Page sections | Implemented |
| `/admin/rooms`, `/new`, `/[id]` (+ `/preview`) | `content:edit` | Room content; branch field planned (M4) | Implemented |
| `/admin/facilities`, `/new`, `/[id]` (+ `/preview`) | `content:edit` | Facility content | Implemented |
| `/admin/media`, `/admin/media/[id]` | `media:upload` | Media library | Implemented |
| `/admin/promotions`, `/new`, `/[id]` | `promotions:manage` | Promotion campaigns | Implemented |
| `/admin/enquiries` | `enquiries:read` | Contact enquiries | Implemented |
| `/admin/settings` | `settings:edit` | Site settings, social links, site images | Implemented |
| `/admin/staff` | `users:manage` | Staff accounts; role and branch assignment planned (M10) | Implemented |
| `/admin/account` | `sessions:manage-own` | Own password and sessions | Implemented |
| `/admin/reservations` | `reservations:read` | List, filters, pagination | Planned (M9) |
| `/admin/reservations/new?type=staff\|external` | `reservations:create` / `reservations:record-external` | Staff booking and external-reservation entry | Planned (M9) |
| `/admin/reservations/[id]` | `reservations:read` | Detail, history, actions | Planned (M9) |
| `/admin/availability` | `inventory:read` | Grid by room type and night, with blocks | Planned (M9) |
| `/admin/inventory` | `inventory:read` | Physical rooms and blocks | Planned (M9) |
| `/admin/pricing` | `pricing:read` | Base rates, periods, rate calendar | Planned (M10) |
| `/admin/reports` | `reports:read` | Statistics | Planned (M10) |
| `/admin/guests`, `/admin/guests/[id]` | `guests:read` (block: `guests:block`) | Guest profiles by phone or name, reservation history, block or unblock a number | Planned (M9) |
| `/admin/audit` | `audit:read` | Audit search | Planned (M10) |
| `/admin/branches`, `/admin/branches/[id]` | `branches:manage` | Branch administration, including sync reminder interval and follow-up delay (the settings form ships in M9 with the reminder) | Planned (M9–M10) |

Staff with more than one branch get a branch switcher in the shell that sets `?branch=` on reservation screens. It is a convenience; the server re-checks every request.

The **sync reminder** is part of the shell, not a page: on every dashboard page, receptionists of a branch that is due get the sound and pop-up (FR-OPS-6).

## Route Handlers and special files

| Route | Purpose | Status |
| --- | --- | --- |
| `/media/[...key]` | Public delivery of `READY` media with its own sandbox CSP | Implemented |
| `/admin/media/upload` | Authenticated, same-origin streaming image upload | Implemented |
| `/sitemap.xml`, `/robots.txt` | Search engine files (published content only) | Implemented |
| `/api/v1/**` | REST API for branches, availability, quotes, reservations, guest access, and staff operations ([../api/api-contracts.md](../api/api-contracts.md)) | Planned (M4–M10) |
