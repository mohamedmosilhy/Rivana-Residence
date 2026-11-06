# Route map

Every route in the application, with its status. Pages live in `src/app`. Public pages share the `(marketing)` layout (header, footer, fonts, CSP). Staff pages share the `/admin` shell, whose navigation shows only destinations the signed-in role may use (`src/presentation/admin/navigation.ts`); each page also checks its capability on the server.

## Public website

Implemented today as one site at unprefixed URLs. From M5 every public page moves under a branch prefix (ADR 026, Q-41); the implemented routes then redirect.

| Route | Purpose | Status |
| --- | --- | --- |
| `/` | Home (implemented). From M5: branch chooser when two or more branches are active, otherwise `307` to the only branch | Implemented; chooser planned (M5) |
| `/about`, `/contact` | About, Contact | Implemented; `308` to `/{branch}/…` from M5 |
| `/rooms`, `/rooms/[slug]` | Room listing and detail | Implemented; `308` to `/{branch}/stay…` from M5 |
| `/facilities`, `/facilities/[slug]` | Facility index and detail (Gym is `fitness-room`, Swimming Pool is `swimming-pool`) | Implemented; `308` to `/{branch}/facilities…` from M5 |
| Legacy `*.html` paths | Permanent redirects (`next.config.ts`) | Implemented; re-pointed to branch URLs in M5 |
| `/{branch}` | Branch home (branch hero, intro, featured listings and facilities, location map, contact block) | Planned (M5) |
| `/{branch}/about` | Branch About | Planned (M5) |
| `/{branch}/stay` | Rooms & Apartments listing (label per FR-CAT-3), Room or Apartment badges | Planned (M5) |
| `/{branch}/stay/[slug]` | Listing detail; Book Now opens `/{branch}/book` with the listing preselected when bookable online (IN-4), otherwise the disabled Book Now | Planned (M5; booking link M10) |
| `/{branch}/facilities`, `/{branch}/facilities/[slug]` | Branch facilities | Planned (M5) |
| `/{branch}/contact` | Branch contact details, interactive Google Map, enquiry form | Planned (M5) |
| `/{branch}/book?checkIn&checkOut&adults&children` | Search form plus results; a plain GET form that works without JavaScript and is shareable | Planned (M10) |
| `/{branch}/book/details` | Selected units, guest details, phone verification, extras, coupon, payment choice, review with VAT, submit (`POST /api/v1/reservations`) | Planned (M10) |
| `/{branch}/book/confirmed` | Confirmation for a `CONFIRMED` booking | Planned (M10) |
| `/{branch}/book/payment` | Return page after Paymob: shows the server status (confirmed, waiting, payment not completed) | Planned (M10) |
| `/reservations/manage` | Guest manage page; reads the token from `#t=`; shows status, payment, and the cancellation request action | Planned (M10) |
| `/reservations/find` | "My reservations": phone number plus WhatsApp code, then that number's reservations (30 minutes) | Planned (M10) |

Branch slugs never collide with `admin`, `api`, `media`, `reservations`, `book`, `sitemap.xml`, `robots.txt`, or legacy paths (validated on the branch).

## Staff dashboard

| Route | Capability | Purpose | Status |
| --- | --- | --- | --- |
| `/admin/login` | — | Staff sign-in | Implemented |
| `/admin` | `admin:access` | Overview; adds today's desk widgets per assigned branch for reservation roles (arrivals, departures, website bookings not yet in the hotel system, open cancellation requests, sync) | Implemented; desk widgets planned (M11) |
| `/admin/pages`, `/admin/pages/[key]` (+ `/preview`) | `content:edit` | Page sections; branch selector planned (M5) | Implemented |
| `/admin/rooms`, `/new`, `/[id]` (+ `/preview`) | `content:edit` | Accommodation listings; branch field (M4) and accommodation type and branch selector (M5) planned | Implemented |
| `/admin/facilities`, `/new`, `/[id]` (+ `/preview`) | `content:edit` | Facility content; branch selector planned (M5) | Implemented |
| `/admin/media`, `/admin/media/[id]` | `media:upload` | Media library | Implemented |
| `/admin/promotions`, `/new`, `/[id]` | `promotions:manage` | Promotion campaigns | Implemented; **retired** (Q-47), removed in M5 |
| `/admin/enquiries` | `enquiries:read` | Contact enquiries | Implemented |
| `/admin/settings/whatsapp` | `settings:edit` | WhatsApp business number (placeholder until supplied), template manager, "Send test message" (Admin only) | Planned (M8) |
| `/admin/settings` | `settings:edit` | Brand settings, social links, site images; contact and map move to branches (M5); VAT rate (Admin, `tax:manage`, M12) | Implemented |
| `/admin/staff` | `users:manage` | Staff accounts; role and branch assignment planned (M12) | Implemented |
| `/admin/account` | `sessions:manage-own` | Own password and sessions | Implemented |
| `/admin/reservations` | `reservations:read` | List, filters, pagination | Planned (M11) |
| `/admin/reservations/new?type=staff\|external` | `reservations:create` / `reservations:record-external` | Staff booking and external-reservation entry | Planned (M11) |
| `/admin/reservations/[id]` | `reservations:read` | Detail, history, actions | Planned (M11) |
| `/admin/availability` | `inventory:read` | Grid by room type and night, with blocks | Planned (M11) |
| `/admin/inventory` | `inventory:read` | Physical rooms and blocks | Planned (M11) |
| `/admin/pricing` | `pricing:read` | Base rates, date periods, rate calendar | Planned (M12) |
| `/admin/reports` | `reports:read` | Statistics | Planned (M12) |
| `/admin/guests`, `/admin/guests/[id]` | `guests:read` (block: `guests:block`) | Guest profiles by phone or name, reservation history, block or unblock a number | Planned (M11) |
| `/admin/audit` | `audit:read` | Audit search | Planned (M12) |
| `/admin/branches`, `/admin/branches/[id]` | `branches:manage` | Branch administration: content owner, contact, address, map embed, check-in and check-out times, hero image, online booking switch, sync settings | Planned (minimal form M5, sync settings M11, full M12) |
| `/admin/cancellations` | `cancellations:decide` | Guest cancellation requests: approve or reject, refund status and retry | Planned (M11) |
| `/admin/services` | `pricing:read` (edit: `services:manage`) | Breakfast and airport transfer per branch | Planned (M12) |
| `/admin/coupons` | `coupons:manage` | Coupon codes and redemption counts | Planned (M12) |
| `/admin/broadcasts` | `marketing:broadcast` | WhatsApp offers to opted-in guests | Planned (M13) |

Staff with more than one branch get a branch switcher in the shell that sets `?branch=` on reservation screens. It is a convenience; the server re-checks every request.

The **sync reminder** is part of the shell, not a page: on every dashboard page, receptionists of a branch that is due get the sound and pop-up (FR-OPS-6).

## Route Handlers and special files

| Route | Purpose | Status |
| --- | --- | --- |
| `/media/[...key]` | Public delivery of `READY` media with its own sandbox CSP | Implemented |
| `/admin/media/upload` | Authenticated, same-origin streaming image upload | Implemented |
| `/sitemap.xml`, `/robots.txt` | Search engine files (published content only; per branch from M5) | Implemented |
| `/api/v1/**` | REST API for branches, availability, quotes, reservations, payments (including the Paymob callback), guest access, and staff operations ([../api/api-contracts.md](../api/api-contracts.md)) | Planned (M4–M13) |
