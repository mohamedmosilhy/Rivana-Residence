# Requirements

## Outcome

Deliver a fast, accessible, search-friendly marketing website that presents Rivana Residence in New Cairo and gives non-technical staff control over approved content. The experience should feel like modern luxury hospitality while retaining Rivana's recognizable plum-and-gold identity.

## Actors

- **Visitor:** explores the property, rooms, facilities, images, location, and contact options.
- **Content editor:** updates copy, images, rooms, facilities, page sections, SEO, and contact details.
- **Administrator:** has editor abilities plus user/security and destructive-content permissions.
- **External reservation provider:** future owner of availability, prices, and booking workflow; it is not a user of this CMS in the initial release.
- **Developer/operator:** deploys, migrates, monitors, and configures integrations.

## Functional scope

### Public website

Routes at launch:

- `/` — Home
- `/about`
- `/rooms`
- `/rooms/[slug]`
- `/facilities`
- `/facilities/gym`
- `/facilities/swimming-pool`
- `/contact`

The navigation may expose Gym and Swimming Pool directly while retaining `/facilities` as the complete index. Unknown or unpublished slugs return a real 404 and are omitted from navigation and sitemaps.

Public capabilities:

- brand-led responsive header, footer, mobile navigation, and clear page hierarchy;
- editorial home/about content managed from the CMS;
- room listing and detail pages with occupancy, size, bed/view summaries, features, and galleries;
- facility listing and detail pages with descriptions, galleries, and optional opening-hours text;
- configurable contact details, map link/embed configuration, social links, and contact form;
- optimized responsive media with meaningful alt text;
- per-page SEO metadata and social share imagery;
- visually complete Book Now controls that do nothing until an external provider is configured;
- accessible feedback for unavailable booking, rather than a broken link or fake workflow.

### Admin CMS

Routes:

- `/admin/login`
- `/admin`
- `/admin/pages`
- `/admin/pages/[key]`
- `/admin/rooms`
- `/admin/rooms/new`
- `/admin/rooms/[id]`
- `/admin/facilities`
- `/admin/facilities/new`
- `/admin/facilities/[id]`
- `/admin/media`
- `/admin/enquiries`
- `/admin/settings`

Admin capabilities:

- closed authentication; no public sign-up;
- edit global identity, logos, contact details, social links, footer text, default SEO, and map configuration;
- edit a controlled set of page sections without arbitrary layout construction;
- create, update, order, feature, publish/unpublish, and delete rooms and facilities;
- upload, replace, search, inspect usage of, and safely delete media;
- set alt text, focal point, and optional caption/credit;
- view and archive contact enquiries;
- validate input and show field-level feedback;
- confirm destructive actions and block deletion of referenced media;
- provide a clear preview or public-view link for editable content.

## Non-functional requirements

- Server Components by default; client JavaScript only for interaction.
- No direct Prisma calls from React page/components or domain/application modules.
- All untrusted input validated with Zod at the server boundary.
- Public content reads are cached and invalidated precisely after admin changes.
- Admin reads are dynamic and protected close to the data source.
- WCAG 2.2 AA is the practical target for authored components and flows.
- Responsive support from 320px upward; primary QA widths: 390, 768, 1024, 1280, and 1440px.
- Keyboard operation, visible focus, semantic controls, and reduced-motion behavior are release requirements.
- Image-heavy pages must avoid layout shift and excessive transfer size.
- Production content updates must not require editing source paths or redeployment, except for configuration/secrets.
- Infrastructure adapters must make database, storage, email, and booking providers replaceable.

## Explicit exclusions

The following must not be built or represented as locally authoritative:

- rates or price tables;
- room inventory or availability calendars;
- reservations, stays, guests, payments, invoices, discounts, or cancellation workflows;
- an availability-search API;
- mock booking success states;
- synchronizing provider data before the provider contract is known;
- a generic drag-and-drop page builder;
- multilingual content in the first release (the model must not prevent a later locale strategy).

The dollar prices and four-month calendars in the reference HTML are design-study placeholders. They are not requirements and must not enter the production model or UI.

## Content migration requirements

- Treat supplied text and images as draft migration inputs, not automatically approved production content.
- Verify room facts and opening hours with the client.
- Obtain a distinct, approved gallery for each room type; the reference reuses the superior-room set for multiple rooms.
- Replace placeholder amenity paragraphs and stock-looking amenity imagery unless ownership/licensing is confirmed.
- Confirm phone, email, address, map coordinates, social URLs, legal links, and copyright owner.
- Preserve source attribution/credit fields when required by an image license.

## Acceptance criteria for the eventual product

- A visitor can understand the property, compare rooms, inspect facilities, contact the residence, and find the future booking entry point on phone and desktop.
- Every Book Now control remains inert and honest until a real integration is enabled.
- An editor can update a room, replace its hero image, and publish the change without developer help.
- Unauthenticated users cannot access admin data or mutations.
- Publishing invalidates only relevant public content.
- A referenced media asset cannot be hard-deleted accidentally.
- Public routes have unique metadata, canonical URLs, correct headings, and valid sitemap entries.
- Critical flows pass automated E2E, accessibility, and responsive checks.
