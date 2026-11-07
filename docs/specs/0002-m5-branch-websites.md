# 0002. Branch websites and the rooms and apartments catalog (M5)

**Date**: 2026-11-07
**Status**: Accepted (owner, 2026-11-07; cross checked by a second model, fixes applied)

## Summary

Every public page moves under its branch, at `/{branch}/…`. A visitor picks a branch from a chooser, or lands straight on the only one, and can switch branches from the header. Old addresses redirect permanently in a single hop. Editors and Admins edit pages, listings, and facilities per branch, and each listing is marked Room or Apartment. Each branch shows its own contact details and Google Map. The promotion popup and the CMS promotions area are removed. Nothing about booking changes: Book Now stays the honest disabled button.

## Context

Since M4, every room, facility, and page belongs to a branch, but the public site still has one set of unprefixed URLs (`/rooms/[slug]`). It reads content from "the default active branch" and contact and map details from site settings. The client decided (Q-41, Q-42, Q-43, Q-47, Q-52, recorded in ADR 026 and ADR 027) that:
- each branch has its own website on shared templates;
- with two or more active branches, `/` becomes a chooser;
- listings are clearly rooms or apartments;
- each branch shows an interactive Google Map;
- the promotion popup is retired.

The forces are mostly about not breaking what exists. The accepted Phase 7 to 11 site has visual baselines, SEO work (canonicals, JSON-LD, sitemap), and legacy `*.html` redirects that search engines already know. Moving every URL risks a ranking dip and redirect chains. Caching is tag based (`unstable_cache` with tags invalidated by `updateTag`), so tags without a branch would let one branch's edit expire another's pages, or worse, serve one branch's content under another. `typedRoutes` is on, so every internal link must be rebuilt for a dynamic `[branch]` segment.

Branch slugs share the top level with real routes. M4 reserved `admin`, `api`, `media`, `reservations`, `book`, `sitemap.xml`, `robots.txt`, and `*.html`. M5 turns `/about`, `/contact`, `/rooms`, and `/facilities` into redirects, so a branch with one of those slugs could never be reached. They must be reserved too: in the domain list and in the database `Branch_slug_check`.

Owner decisions taken on 2026-11-07 for this milestone:
1. Phone, email, address, coordinates, and map move from the Settings form to the branch form.
2. `/admin/promotions` is removed entirely.
3. M5 builds a minimal branch list, add form, and edit form.
4. The header shows the branch name and the switcher only when two or more branches are active.

There is no `docs/scope/` tracker (owner choice). This spec is the source of truth for the build tasks.

## Requirements

**User stories**:
- As a visitor, I want to pick the branch I am interested in, or land on it directly when there is only one, so that everything I read is about that place.
- As a visitor, I want to switch branches without losing my place, so that I can compare rooms or facilities.
- As a visitor, I want to see whether a listing is a room or an apartment, and an apartment's bedrooms and bathrooms, so that I am not misled.
- As an Editor or Admin, I want to choose a branch in the CMS and edit its pages, listings, and facilities, so that each branch's site is its own.
- As an Admin, I want to add and edit branches (contact, address, map, times, hero image, status), so that opening a branch needs no deploy.
- As anyone with an old link, I want it to keep working, so that bookmarks and search results still land on the right page.

**Acceptance criteria** (from the brief, plus the owner decisions; each checkable):
- **AC-1**: With one active branch, `/` redirects (`307`) to `/new-cairo`, and every accepted page renders under `/new-cairo/…` with the same content as before. The header looks as it does today: no branch name, no switcher.
- **AC-2**: Every URL in the Phase 7 and Phase 10 route inventories reaches its branch equivalent through a single permanent (`308`) redirect, including the legacy `*.html` paths.
- **AC-3**: With two active branches, `/` shows the chooser with both branches. Choosing one shows that branch's Home text and images. The header shows the branch name and a switcher, and switching changes every branch-owned text and image on every page type, keeping the page type where it exists.
- **AC-4**: A listing, facility, or page of branch A never appears under branch B, in public pages or the public API. An inactive branch's URLs return 404.
- **AC-5**: Apartments show an Apartment badge and their bedroom and bathroom facts; rooms show a Room badge. The navigation label is "Rooms & Apartments", "Rooms", or "Apartments" by what the branch has published, and is hidden when it has none. Page titles and headings follow the same rule.
- **AC-6**: Each branch's Contact page, and the location block on its Home page, show its interactive map. With the embed URL empty or third-party frames blocked, the address and directions link still work. The branch form rejects a non-Google embed URL.
- **AC-7**: No public page contains promotion popup markup or its client JavaScript. `/admin/promotions` and its subpages no longer exist, and no role has `promotions:manage`.
- **AC-8**: The sitemap and canonicals contain only branch URLs of active branches and published content (plus `/` only while it is the chooser).
- **AC-9**: Book Now is the honest disabled control on every page, and receives the branch (and the listing on detail pages) as context.
- **AC-10**: axe reports no serious or critical issues on the chooser and branch pages, and nothing overflows horizontally at 320 px.
- **AC-11**: The Settings form no longer shows phone, email, address, coordinates, or the map. The branch form edits them, and a saved change appears on that branch's pages (footer, mobile menu, Contact, Hotel JSON-LD) right away.
- **AC-12**: An Admin can list, add, and edit branches at `/admin/branches`. Adding a branch (form or API-A2) creates its Home, About, and Contact pages unpublished, with the draft section skeleton, in one transaction with an audit row. Editors, Receptionists, and Managers are refused. The default branch (`new-cairo`) cannot be deactivated.
- **AC-13**: The CMS Pages, Rooms, and Facilities screens have a branch selector. Lists show only the selected branch's records. A create form preselects the selected branch, and the server refuses a branch that does not exist.
- **AC-14**: A contact enquiry records the branch whose Contact page sent it. The enquiry list can be filtered by branch, and Receptionists and Managers still see only their own branches.
- **AC-15**: API-P1 to P4 and API-A1 to A3 behave as in `docs/api/api-contracts.md` and are in `docs/api/openapi.json`.
- **AC-16**: A branch slug equal to `about`, `contact`, `rooms`, or `facilities` (or any slug reserved in M4) is refused by the domain schema and by the database.

## Options considered

### Option 1: A dynamic `[branch]` segment on shared templates, static redirects in `next.config.ts`, branch-qualified cache tags (chosen)

Pages move under `src/app/(marketing)/[branch]/`, and a branch layout resolves the slug once per request. Old URLs redirect in `next.config.ts` to the first branch (`new-cairo`, a constant). Cache tags carry the branch slug.

**Pros**:
- One template per page type, with no per-branch code (ADR 026).
- Redirects are evaluated before routing, statically, in a single hop. Search engines see one `308`.
- Tags per branch make cache isolation testable.

**Cons**:
- The redirect target is a constant. If `new-cairo` were ever deactivated, old links would land on a 404 until the constant changes.
- Every public link changes, and the visual baselines and E2E specs move to new URLs.

### Option 2: Redirect old URLs from a route that reads the first active branch

A catch-all or proxy rule looks up the first active branch per request and redirects there.

**Pros**:
- Follows whichever branch is first, with no constant.

**Cons**:
- A database read on every old URL, and a `308` that changes meaning when data changes. Permanent redirects are cached by browsers and search engines, so a moving target is wrong for them.
- More code than a static table, and it competes with `[branch]` for the same paths.

### Option 3: Keep unprefixed URLs and carry the branch in a cookie or query string

**Pros**:
- No URL move, and no redirect risk.

**Cons**:
- Rejected by ADR 026 (pages cannot be shared or indexed per branch). Listed only for completeness.

## Decision

**Chosen option**: Option 1: a dynamic `[branch]` segment on shared templates, static single-hop redirects in `next.config.ts` to `DEFAULT_BRANCH_SLUG`, and branch-qualified cache tags.

Every public page lives under `/{branch}/…` and resolves an active branch first. Old URLs redirect permanently to `new-cairo`. All public reads, writes, and cache tags carry the branch.

## Rationale

The force that matters most is not losing what the accepted site already earned: old links, search rankings, and visual parity for the one-branch case. A static redirect table gives one predictable `308` per old URL. That is exactly what search engines want, and it is testable as plain data. The constant is safe because a branch slug is immutable after first activation (branch model). Moving the redirect target is a one-line change if the owner ever retires `new-cairo`.

A `[branch]` layout that resolves the branch once and passes it down keeps pages thin. It also makes isolation structural: every query receives a branch id the server resolved, never one the client sent. Tags of the form `branch:{slug}:…` follow ADR 026 and make "an edit to A never expires B" a test, not a hope.

Option 2's dynamic redirect looks flexible, but a permanent redirect whose target depends on data contradicts the cache semantics of `308`. It is more code for a case (deactivating the first branch) that has no plan behind it.

## Feature design

### Route tree

```
src/app/(marketing)/
  layout.tsx            fonts, motion, skip link, site metadata (no header, footer, or popup)
  page.tsx              chooser (2+ active) · redirect 307 (1) · holding message (0)
  not-found.tsx         brand-only header and footer, link to "/"
  [branch]/
    layout.tsx          resolves the active branch, else notFound(); header, main, footer, Hotel JSON-LD
    not-found.tsx       in-branch 404 (inside the branch shell), links to the branch home and stay
    page.tsx            branch home: managed sections, then the location block
    [...rest]/page.tsx  calls notFound(), so unknown paths inside a branch get the branch shell
    about/page.tsx
    contact/page.tsx    managed sections, "Find us" block with LocationMap, enquiry form
    stay/page.tsx       listing index (label from stayLabel)
    stay/[slug]/page.tsx
    facilities/page.tsx
    facilities/[slug]/page.tsx
```

The old `about`, `contact`, `rooms`, `rooms/[slug]`, `facilities`, and `facilities/[slug]` page files are deleted; the redirects cover them. Pages are dynamic (`connection()` as today). `generateStaticParams` is not used.

Which not-found page renders:

| Case | Example | Rendered by |
| --- | --- | --- |
| Unknown or inactive branch | `/luxor`, `/demo-giza` while inactive | `(marketing)/not-found.tsx` (brand shell), because `[branch]/layout.tsx` throws `notFound()` above its own boundary |
| Unknown path inside an active branch | `/new-cairo/nope` | `[branch]/not-found.tsx` (branch shell), via the `[...rest]` catch-all |
| Unknown listing or facility slug, or another branch's | `/new-cairo/stay/missing` | `[branch]/not-found.tsx` |
| Anything outside `(marketing)` | `/admin/nope` | The existing root `src/app/not-found.tsx` |

**Status and indexing:**
- The chooser answers `200`, is indexable, and has canonical `/`.
- The no-branch holding page answers `200` with `robots: noindex` and no navigation.
- A branch whose HOME page is not published renders today's quiet holding hero (`PageHero` with the branch name and "being prepared" intro) followed by the location block, and is left out of the sitemap.

The brand-only header (logo linking to `/`, no navigation, no Book Now) and the brand footer (brand, tagline, social links, legal) are used by the chooser and the top-level not-found page. `SiteHeader` and `SiteFooter` take an optional branch: with none, they render the brand-only form.

### Redirect table (`next.config.ts`, all `permanent: true`, so `308`)

`DEFAULT_BRANCH_SLUG` moves to a dependency-free module, `src/domain/branches/default-branch.ts`. `next.config.ts` imports it by relative path (it is loaded without the TypeScript path aliases), and `prisma/seed-data.ts` re-exports it. It is written as `B` below.

| Source | Destination |
| --- | --- |
| `/about` | `/B/about` |
| `/contact` | `/B/contact` |
| `/rooms` | `/B/stay` |
| `/rooms/:slug` | `/B/stay/:slug` |
| `/facilities` | `/B/facilities` |
| `/facilities/:slug` | `/B/facilities/:slug` |
| `/index.html` | `/B` |
| `/about.html` | `/B/about` |
| `/contact.html` | `/B/contact` |
| `/rooms.html` | `/B/stay` |
| `/room-studio-balcony.html` | `/B/stay/studio-with-balcony` |
| `/room-deluxe-double.html` | `/B/stay/deluxe-double` |
| `/gym.html` | `/B/facilities/fitness-room` |
| `/swimming-pool.html` | `/B/facilities/swimming-pool` |

Every destination is final (no chained hop). `/index.html` goes to `/B`, not to `/`, which would add a `307`. The table is exported as data (`legacyRedirects(slug)`) so a unit test can check single hops.

### Reserved slugs (AC-16)

- `RESERVED_BRANCH_SLUGS` in `src/domain/branches/branch.ts` gains `about`, `contact`, `rooms`, and `facilities`.
- Migration `…_reserve_legacy_branch_slugs` drops and recreates `Branch_slug_check` with the longer list. It is safe because the only branch is `new-cairo`, and the migration fails loudly if a row would violate it.
- `prisma migrate diff` must still report no difference (CHECKs are SQL only).

### Branch resolution and isolation

- `getActiveBranchBySlug(slug)` (composition, cached under the `branches` tag) returns the public branch view model, or `null` for unknown or inactive slugs. `[branch]/layout.tsx` and every page call it, and the cache dedupes the call. `null` leads to `notFound()`.
- Each public getter takes the resolved `branchId` (never a client value):
  - `getPublishedPage(branchId, key)`
  - `getPublishedRooms(branchId)` and `getPublishedRoom(branchId, slug)`
  - `getPublishedFacilities(branchId)` and `getPublishedFacility(branchId, slug)`
- The repositories already filter by `branchId` (M4). A slug owned by another branch returns `null`, so the page shows `notFound()`.
- `getActiveBranches()` (cached under `branches`) feeds the chooser, the switcher, the sitemap, and the single-branch redirect on `/` (which reads this cached list, so expiring `branches` on activation or deactivation keeps `/` correct). Each entry carries the published accommodation types and whether any facility is published. These come from two grouped queries on published rows: rooms grouped by `(branchId, accommodationType)`, and facilities grouped by `branchId`. The switcher and labels then need no extra query.
- **Cache key rule:** `unstable_cache` does not key on closure variables, so every key names its branch: `["public", "branch", slug]` for the lookup and `["public", "branch", branchId, "rooms"]` for the rest. A test with two branches checks that one branch's cached value is never served for the other (cache bleed).

### View models and DTOs

| Name | Layer | Fields |
| --- | --- | --- |
| `BranchRecord` (renamed from M4's `BranchSummary` port type, to free the name) | `src/application/branches/ports.ts` | `id, slug, name, status, sortOrder` |
| `BranchRow` (full read for public and admin) | repository | every `Branch` column the form and site use, plus `heroMediaId` |
| `PublicBranch` | `src/application/public/view-models.ts` | `id, slug, name, summary, city, addressLines, phone, email, latitude, longitude, mapEmbedUrl` (null unless `isMapEmbedUrl` passes), `checkInTime, checkOutTime, hero: PublicImage \| null, stayTypes: ("ROOM" \| "APARTMENT")[], hasFacilities: boolean` |
| `BranchSummary` (API-P1) | `src/contracts/api/v1/branches.ts` | `slug, name, summary, city, heroImage: Image \| null, onlineBookingEnabled` (as api-contracts) |
| `BranchDetail` (API-P2) | contracts | `BranchSummary` plus `phone, email, addressLine1, addressLine2, city, country, latitude, longitude, checkInTime, checkOutTime, mapEmbedUrl` |
| `RoomTypeSummary` (API-P3) | contracts | as api-contracts: `slug, name, accommodationType, shortDescription, maxAdults, maxChildren, bedroomCount, bathroomCount, heroImage, detailUrl` |
| `RoomTypeDetail` (API-P4) | contracts | `RoomTypeSummary` plus `sizeSqm, bedSummary, viewSummary, features: string[], gallery: Image[]` (the existing `PublicRoom` facts; the rich text description is not exposed) |
| `StaffBranch` (API-A1 to A3) | contracts | `id, slug, name, status, sortOrder, onlineBookingEnabled` |
| `Image` | contracts | `src, alt, width, height`, mapped from `PublicImage` (the same `publicImage()` rules: `READY` and rights confirmed) |

`PublicRoom` gains `accommodationType`, `bedroomCount`, and `bathroomCount`. The API DTOs are mapped from `PublicBranch` and `PublicRoom`, never from Prisma rows.

**Where the branch hero appears:** on the chooser card and as the Hotel JSON-LD `image` only. Branch pages keep their managed HERO sections.

**Where each contact field is read from after M5:**

| Place | Before | After |
| --- | --- | --- |
| Branch footer: address, phone, email | Settings | `PublicBranch` |
| Mobile menu: phone, email | Settings | `PublicBranch` |
| Contact page "Find us" | Settings | `PublicBranch` |
| `LocationMap` | Settings | `PublicBranch` |
| `CONTACT_CTA` section contact details | Settings | `PublicBranch` |
| Hotel JSON-LD | Settings | `PublicBranch` (logo and `sameAs` stay from settings) |
| Chooser, brand footer, top-level not-found | Settings | None (brand and social links only) |

### Cache tags (`src/application/cache/cache-tags.ts`)

| Tag | Covers | Expired by |
| --- | --- | --- |
| `branches` | Active branch list, slug lookup, branch view models (contact, map, hero, `stayTypes`, `hasFacilities`) | Branch create or update; media change on a branch hero; a listing or facility publish, unpublish, or archive; a change of a published listing's `accommodationType` (these change `stayTypes` or `hasFacilities`). A plain text edit of a published record does **not** expire it |
| `branch:{slug}:page:{key}` | A published page | Page publish, unpublish, or published edit; media change in its sections |
| `branch:{slug}:stay` | Published listing index for the branch | Listing publish, unpublish, reorder, or archive |
| `branch:{slug}:stay:{roomSlug}` | One published listing | Its publish or edit; media change on it |
| `branch:{slug}:facilities` | Published facility index | As for stay |
| `branch:{slug}:facility:{facilitySlug}` | One published facility | As for stay |
| `sitemap` | Sitemap data | Any of the above |
| `site-settings` | Brand settings (unchanged) | Settings save |

- The flat `rooms`, `room:*`, `facilities`, `facility:*`, `page:*`, and `promotion:active` tags are removed.
- Commands get the slug through `BranchRepository.findById(record.branchId)`. Branch slugs never change after creation, so a stale slug cannot occur.
- Cache keys include the branch id: `["public", "branch", branchId, "rooms"]`.
- **Exact sets per write**, which the isolation test asserts (no `branch:{other}:*` tag is ever expired):

| Write | Tags expired |
| --- | --- |
| Published listing text edit | `branch:{s}:stay`, `branch:{s}:stay:{room}`, `sitemap` |
| Listing publish, unpublish, archive, or type change | the above plus `branches` |
| Listing reorder | `branch:{s}:stay`, `sitemap` |
| Facility edits | the same pattern with `facilities` and `facility:{slug}` |
| Page publish, unpublish, or published edit | `branch:{s}:page:{key}`, `sitemap` |
| Branch create or update | `branches`, `sitemap`, and every `branch:{s}:…` tag of that branch (tags are listed explicitly, never by pattern: the three page keys, `stay`, `facilities`, and each published listing and facility slug of the branch) |
| Settings save | `site-settings` (unchanged) |

- **Media usage:** `MediaUsageKind` gains `BRANCH` (the branch hero, `ownerId` = branch id, role "Hero"). Every `MediaUsage` gains `branchSlug: string | null`, set for rooms, facilities, page sections and sharing images (joined through the owner's `branchId`), and for `BRANCH`. `tagsForUsage` builds the branch tags from it, and adds `branches` for a `BRANCH` usage. The delete guard lists branch heroes like any other use (the database also blocks it: `Branch.heroMediaId` is `onDelete: Restrict`).

### CMS branch selector (AC-13)

- `?branch=<slug>` on `/admin/pages`, `/admin/pages/[key]` (and its preview), `/admin/rooms`, and `/admin/facilities`.
- When absent or unknown, it falls back to the first branch by `sortOrder` (any status, as M4's `findDefault`), and the selector shows which branch is in use.
- `presentation/admin/content/branch-selector.tsx` is a GET form with a native `<select>` and a submit button. It works without JavaScript and keeps the other filters as hidden inputs.
- Pagination, filter, and "Add" links keep `branch`.
- Queries take the branch: `PageQueries.list(staff, branchSlug)` and `CatalogQueries.list(staff, params)`, where params include `branch`.
- Create forms get a "Branch" `<select>` preset from `?branch=`. It posts the branch **slug** (never an id). The create action re-resolves it on the server and refuses an unknown value with the field error "Choose a branch."
- The edit form keeps M4's read-only branch field. A record's branch is fixed after creation, because listing and facility slugs are globally unique and moving branches would silently change public URLs.
- Page actions carry the branch slug in a hidden field and re-resolve it on the server. Page keys are unique per branch (`branchId_key`).

### Branch admin (owner decision 3, AC-12)

- **Routes:** `/admin/branches` (list: name, slug, status, city, sort order), `/admin/branches/new`, and `/admin/branches/[id]`. Each is behind `branches:manage` (Admin only today). Navigation shows "Branches" for that capability.
- **Form fields:**
  - name, summary, status, and sort order;
  - phone and email;
  - address lines 1 and 2, city, and country;
  - latitude and longitude;
  - check-in and check-out times (`HH:MM`);
  - the hero image, using the existing media picker;
  - the Google Maps embed URL.
- **Slug:** editable on "new" only. It's shown read only afterwards, because a slug is immutable once created in M5, which is simpler than "after first activation" and safe.
- **Fixed fields:** `onlineBookingEnabled` is shown read only ("Online booking arrives in a later release"). Time zone stays `Africa/Cairo` (not on the form). The sync fields wait for M11.
- **Use case:** Server Actions call `ManageBranches`, the same use case API-A2 and A3 use.
- **Create, in one transaction:**
  - insert the branch;
  - create its HOME, ABOUT, and CONTACT pages, unpublished, with `canonicalPath` `/`, `/about`, and `/contact` (paths inside the branch, as stored today);
  - add the draft section skeleton from `defaultPageSections(key, branchName)`, with the HERO title set to the branch name;
  - append an audit event `branch.created`.
- `defaultSections` moves from `prisma/seed-data.ts` to `src/domain/content/default-sections.ts`, and the seed imports it from there.
- **Update:** appends `branch.updated` with the changed fields (`{ field: { from, to } }`) and expires `branches`, `sitemap`, and every `branch:{slug}:…` tag of that branch.
- **Deactivation** follows the branch model: the branch drops out of the chooser and switcher, and its pages give 404. If it was the last active branch, `/` shows the holding message, and the form says so next to the status field.
- **Default branch guard (owner decision, 2026-11-07):** the branch whose slug equals `DEFAULT_BRANCH_SLUG` (`new-cairo`) cannot be set `INACTIVE`, because every old-URL redirect points to it. The form and API-A3 refuse with `422 VALIDATION`, `fieldErrors.status`: "This branch receives the old website addresses and cannot be deactivated." Changing that needs a code change to the redirect constant.
- **Schema:** `branchInputSchema` (create) extends M4's `branchSchema` with:
  - `heroMediaId`: optional and nullable. The use case checks it names an existing media asset that is `READY` and not deleted, else `fieldErrors.heroMediaId`.
  - `onlineBookingEnabled`: optional, and only `false` is accepted in M5.
  - `branchUpdateSchema` is the partial of the same without `slug`. An unknown key (including `slug`) gives `422`, through the strict schema.
- **Duplicate slug:** the unique-constraint error (Prisma `P2002` on `slug`) maps to `CONFLICT`. The API answers `409`; the form shows `fieldErrors.slug`: "That web address is already used by another branch."
- **Audit payloads** (added to `AuditChanges` in `src/domain/audit`):
  - `branch.created`: `{ slug, name, status }`;
  - `branch.updated`: `{ [field]: { from, to } }`, with only changed fields;
  - both have `entityType: "Branch"`, `entityId` = branch id, `branchId` = branch id, actor = the staff principal.
- **Transaction port:**
  - `BranchRepository.create(input, actor, seed)` runs one `prisma.$transaction`. It inserts the branch, then calls `PrismaPageRepository.createWithSections(tx, branchId, pages)` and `PrismaAuditLog(tx).append(event)` on the same transaction client.
  - `ManageBranches` passes `seed = defaultPageSections` for the three keys. Any failure rolls back everything.
  - `update(id, patch, actor)` likewise writes the row and the audit event in one transaction.

### Settings retirement (owner decision 1, AC-11)

- The settings form schema in `src/domain/settings/site-settings.ts` drops phone, email, address lines, city, country, latitude, longitude, and `mapEmbedUrl`. The columns remain, and the update writes only the remaining fields, so the old values are left untouched until a later contract migration.
- The settings page gets a one-line note: "Contact details, address, and map are set on each branch."
- `isMapEmbedUrl` and `MAP_EMBED_MESSAGE` stay exported, because the branch schema uses them.
- The public settings view model drops the contact fields. Contact data comes from the branch view model only.

### Public UI

- **Header:**
  - `SiteHeader({ branch, branches, settings, bookingMessage })`.
  - The logo links to `/{slug}`.
  - The navigation is `siteLinks(slug, stayLabel)`: Home, the stay label (omitted when null), Facilities, About, and Contact.
  - With `branches.length >= 2` it also shows the branch name, plus `BranchSwitcher`: a client component with a native `<details>` disclosure, a list of plain links, and `aria-current` on the current branch. Its hrefs come from `switchTarget(pathname, target)` using `usePathname`, so the server-rendered HTML already has correct links.
  - The mobile menu lists the same branch links and the branch's phone and email.
  - The active-link rule in `site-nav-links.tsx` changes from `pathname === "/"` to "Home is current at exactly `/{slug}`; others when the path equals or starts with the link". The menu's close-on-navigation (`usePathname` in `mobile-menu.tsx`) keeps working unchanged.
- **Switch mapping** (`src/domain/branches/switch-target.ts`, pure):

| Current path | Target branch has | Destination |
| --- | --- | --- |
| `/{a}` | anything | `/{b}` |
| `/{a}/about` or `/{a}/contact` | anything | same page type at `/{b}` |
| `/{a}/stay` | published listings | `/{b}/stay`, else `/{b}` |
| `/{a}/stay/{slug}` | published listings | `/{b}/stay` (listing slugs are global, so the item cannot exist at b), else `/{b}` |
| `/{a}/facilities` | published facilities | `/{b}/facilities`, else `/{b}` |
| `/{a}/facilities/{slug}` | published facilities | `/{b}/facilities`, else `/{b}` |
| anything else | anything | `/{b}` |

- **Stay label** (`stayLabel(types)` in `src/domain/catalog/stay-label.ts`):
  - `{ROOM, APARTMENT}` gives "Rooms & Apartments";
  - `{ROOM}` gives "Rooms";
  - `{APARTMENT}` gives "Apartments";
  - empty gives `null`.
  - It is used by the nav, the stay index title and `h1`, the breadcrumbs, and the Home grid's link label. A branch with no published listings has no stay link, and `/{b}/stay` shows the empty listing message as today (not a 404).
- **Page titles:** unchanged in format (`%s | {siteName}`). With two or more active branches, the stay and facilities index titles append " at {branch.name}", so titles stay distinct between branches. With one branch, titles are exactly as today.
- **Cards and detail:**
  - `RoomCard` and the room detail show a badge ("Room" or "Apartment").
  - `roomFactList` adds "Bedrooms" and "Bathrooms" for apartments when set.
  - The detail heading "In the room" becomes "In the apartment" for apartments.
- **Links:**
  - `CtaLink` targets become `/{slug}/contact`, `/{slug}/stay`, and `/{slug}/facilities`.
  - `cards.tsx`, the section renderer, the footer, the breadcrumbs, and the detail pages all take `branchSlug`.
  - Typed links use `` `/${slug}/stay` as Route ``, as the code does today.
- **Footer** on branch pages: brand, tagline, and social links (settings); the branch address, phone, and email; a Contact link to `/{slug}/contact`.
- **Contact page:** heading "Visit {branch.name}"; contact items and `LocationMap` from the branch.
- **Home location block:** after the managed sections, a fixed "Location" section with `LocationMap` and the address, rendered when the branch has a map URL or an address. It is a template block, not a new registry section type, so the content model and page editor do not change.
- **`LocationMap({ place })`:**
  - `place` is `{ name, addressLines, latitude, longitude, mapEmbedUrl }` from the branch view model.
  - The iframe stays lazy and sandboxed (`allow-scripts allow-same-origin allow-popups`), titled "Map showing {name}".
  - The directions link and address are always present.
  - The CSP keeps `frame-src https://www.google.com` only.
  - The URL is rendered only after `isMapEmbedUrl` passes again in the view model mapper (defense in depth against a value written outside the form).
- **Book Now:** `BookNowButton` gains optional `branchSlug` and `listingSlug` props, rendered as `data-branch` and `data-listing`. It stays a `type="button"` with `aria-disabled="true"`.
- **Chooser** (`(marketing)/page.tsx`, two or more active branches):
  - A brand heading (`settings.siteName`) and intro (`settings.tagline`).
  - One card per branch, in `sortOrder`, each a link to `/{slug}`, with the name, city, and summary.
  - The card image is the branch hero, or no image (the card still works). There is no fallback to page images, so the card is fully covered by the `branches` tag.
  - Metadata: title `settings.defaultSeoTitle` or the site name, canonical `/`.
- **Promotions removed:**
  - `ActivePromotion` is removed from the layout.
  - `src/presentation/features/promotions/*` is deleted, along with the popup CSS in `globals.css` (only selectors no other component uses).

### SEO (AC-8)

- **Canonicals:** `pageMetadata({ path })` receives branch paths. `pagePath(slug, key)` gives `/{slug}`, `/{slug}/about`, or `/{slug}/contact`. The stored `Page.canonicalPath` stays a path inside the branch, and the admin shows `pagePath(slug, key)` as the public address.
- **Hotel JSON-LD:** emitted by `[branch]/layout.tsx`, one per branch:
  - `@id` `{origin}/{slug}#hotel`;
  - `name` = branch name;
  - `url` `/{slug}`;
  - address, geo, telephone, and email from the branch;
  - `image` = branch hero, else the default share image;
  - logo and `sameAs` from settings.
  - The chooser emits no Hotel entity.
- **Listing JSON-LD:** `HotelRoom` for `ROOM`; `Accommodation` for `APARTMENT` (chosen over `Apartment`, which the brief allowed only if a schema check passes; `Accommodation` is the safe general type), with `numberOfBedrooms` and `numberOfBathroomsTotal` when set. `containedInPlace` points to the branch hotel `@id`. No offers or prices.
- **Breadcrumbs:** `{branch.name}` → `/{slug}`, then the section (stay label or "Facilities"), then the item.
- **Sitemap:**
  - `/` only when it is the chooser (two or more active branches);
  - then, for each active branch: `/{slug}` (Home published), `/{slug}/about`, `/{slug}/stay` with each published listing, `/{slug}/facilities` with each published facility, and `/{slug}/contact`;
  - all with accurate `lastModified`, exactly as the current rules but per branch.
- `robots.ts` is unchanged.

### Contact enquiries (AC-14)

- The contact form posts a hidden `branch` field (the slug of the page it is on).
- `SubmitEnquiry` resolves it with `BranchRepository.findBySlug`, requiring `ACTIVE`. An unknown or inactive slug is refused with the form's generic error, and nothing is stored or sent.
- It stores `ContactEnquiry.branchId`. The delivered message (outbox or SMTP) names the branch in its subject and body.
- `ListEnquiries` gets an optional `branch` filter (a slug, re-resolved on the server). It is intersected with `branchScope(staff)`: Receptionists and Managers can only narrow within their own branches.
- The enquiry list shows a branch column, with "–" for older enquiries that have no branch. As in M4, those older enquiries are visible to Admin and Editor only, because a branch-scoped role sees only rows whose `branchId` is in its scope.

### API surface (AC-15)

All routes use the M4 wrappers, stay under 60 lines, and are registered in `src/contracts/api/v1/routes.ts`. Contracts are in `src/contracts/api/v1/branches.ts`. `Image` = `{ src, alt, width, height }`, matching the public image view model.

| Id | Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
| --- | --- | --- | --- | --- | --- | --- |
| API-P1 | `/api/v1/branches` | GET | none | `{ items: BranchSummary[] }`, active only, by `sortOrder` | public | none |
| API-P2 | `/api/v1/branches/{branchSlug}` | GET | path slug | `BranchDetail` (summary fields plus phone, email, address lines, city, country, latitude, longitude, check-in and check-out times, `mapEmbedUrl`) | public | 404 `NOT_FOUND` (unknown or inactive) |
| API-P3 | `/api/v1/branches/{branchSlug}/room-types` | GET | `?type=ROOM\|APARTMENT` (optional, strict) | `{ items: RoomTypeSummary[] }`, published, in display order, `detailUrl` `/{slug}/stay/{roomSlug}` | public | 404, 422 bad `type` |
| API-P4 | `/api/v1/branches/{branchSlug}/room-types/{roomSlug}` | GET | path slugs | `RoomTypeDetail` (summary plus features, size, gallery images) | public | 404 (unknown, unpublished, or another branch's listing) |
| API-A1 | `/api/v1/staff/branches` | GET | none | `{ items: StaffBranch[] }` (id, slug, name, status, sortOrder), Admin all, others `branchScope` | staff, `inventory:read` | 401, 403 |
| API-A2 | `/api/v1/staff/branches` | POST | `BranchInput` (strict) | `201 StaffBranch` | staff, `branches:manage`, CSRF | 401, 403, 409 `CONFLICT` (slug taken), 422 |
| API-A3 | `/api/v1/staff/branches/{id}` | PATCH | partial `BranchInput` without `slug` (strict) | `200 StaffBranch` | staff, `branches:manage`, CSRF | 401, 403, 404, 422 |

- **Caching and headers:** P1 to P4 read through the same cached composition getters as the pages (so tag invalidation covers them) and keep the M4 wrapper headers (`Cache-Control: no-store`, `X-Request-Id`, `nosniff`). No CORS headers are added. A bad `?type=` returns the standard `422` problem body with `fieldErrors.type`.
- `BranchInput` includes `onlineBookingEnabled`. In M5, `true` is always refused with `422 VALIDATION` and `fieldErrors.onlineBookingEnabled`: the VAT rate and WhatsApp prerequisites do not exist yet (api-contracts note on API-A3).
- The sync fields are accepted and validated by M4's ranges but not shown in the CMS (M11).
- `npm run openapi` regenerates the document, and the freshness test guards it.

### Value sourcing

| Action | Value | Source |
| --- | --- | --- |
| `/` | Number of active branches; branch cards | `Branch.status`, `sortOrder` via `getActiveBranches()` |
| `/` | Chooser heading and intro | `SiteSettings.siteName`, `SiteSettings.tagline` |
| Chooser card | Image | `Branch.heroMediaId`, else none |
| `/` (one branch) | Redirect target | Slug of the only active branch, from the cached `getActiveBranches()` list |
| Old URLs | Redirect target | `DEFAULT_BRANCH_SLUG` constant (`new-cairo`) |
| Branch layout | Branch identity, contact, map, hero | `Branch` row by the path slug, `ACTIVE` only |
| Header | Whether to show the name and switcher | `getActiveBranches().length >= 2` |
| Switcher | Target hrefs | `switchTarget(usePathname(), target)`, with target flags (published types, has facilities) from `getActiveBranches()` |
| Nav and titles | Stay label | `stayLabel(published accommodation types of the branch)` |
| Cards and detail | Badge, bedrooms, bathrooms | `Room.accommodationType`, `bedroomCount`, `bathroomCount` |
| Listing form | Accommodation type and counts | Form fields, validated by the room input schema |
| Contact page | Map, address, phone, email | `Branch.mapEmbedUrl`, address columns, `phone`, `email` |
| Enquiry | `branchId` | Hidden `branch` slug, resolved to an `ACTIVE` branch on the server |
| CMS lists | Selected branch | `?branch=` slug re-resolved on the server, else first by `sortOrder` |
| Create forms | Branch of the new record | Posted branch slug re-resolved on the server; must exist |
| Branch status | Whether deactivation is allowed | Refused when `slug = DEFAULT_BRANCH_SLUG` |
| Enquiry list | Branch column | `ContactEnquiry.branchId` joined to `Branch.name`, "–" when null |
| Branch create | Three pages and sections | `defaultPageSections(key, branchName)` in `src/domain/content` |
| Page canonical | Public path | `pagePath(branch.slug, page.key)` |
| JSON-LD | Hotel `@id`, address, contact | Branch row plus `getPublicOrigin()` |
| Audit | Actor, changes | `StaffPrincipal.id`; diff of the input against the stored row |
| Cache invalidation | Tags | `BranchRepository.findById(record.branchId).slug` plus the record slug |

### Key invariants

- Every public read takes a branch id the server resolved from the path. No public query runs without one, and none aggregates across branches.
- An inactive branch is invisible publicly: no pages, no API, no chooser, switcher, or sitemap entries.
- A record's branch is fixed after creation (listing, facility, page). A branch slug is fixed after creation.
- A branch slug is never a reserved segment (domain and database).
- Map URLs are rendered only when they match the Google embed allowlist.
- No public page imports promotion code. No role has `promotions:manage`.
- Every redirect in the table is a single hop to a final URL.
- The default branch (`new-cairo`) is always active, so every redirect destination exists.
- Every `unstable_cache` key names its branch.

### Security model

- **Public:** branch resolution is a server lookup by slug with `status = ACTIVE`. Client values (the hidden branch on the contact form, `?branch=` in the CMS) are always re-resolved and never trusted as ids.
- **Content (Pages, Rooms, Facilities):** `content:edit` (Editor, Admin). Editors have no branch scope (Q-01), so any existing branch is allowed.
- **Branch admin and API-A2/A3:** `branches:manage` (Admin). API-A1: `inventory:read`, with Receptionists and Managers limited by `branchScope`. Staff mutations go through the M4 `staffRoute` (CSRF, `401`, size cap). Server Actions keep Next's built-in origin check.
- **Enquiries:** unchanged capability; the branch filter is intersected with `branchScope`.
- **XSS:** map URLs are validated on write (form and API) and re-checked on render. JSON-LD keeps `serializeJsonLd` (escapes `<`).
- Every new use case is added to the authorization sweep.

### Configuration required

None. No new environment variables.

### Critical test scenarios

- **Single branch:** `/` gives `307 /new-cairo`. Every accepted page renders under `/new-cairo/…` with the same visible content, and the header has no switcher. Verifies **AC-1**.
- **Redirects:** each table row gives one `308` to a final `200`. Verifies **AC-2**.
- **Two branches** (`demo-giza` activated in the test): the chooser lists both, and the switcher from `/new-cairo/stay/deluxe-double` goes to `/demo-giza/stay`. Verifies **AC-3**.
- **Isolation:**
  - `/demo-giza/stay/deluxe-double` returns 404, and API-P4 for it returns 404.
  - Each write expires exactly the set in the tag table, and never a `branch:demo-giza:*` tag for a new-cairo write.
  - A cache-bleed test: both branches' pages and listings are read once (so the cache is warm), then each is read again and still shows only its own content.
  - Deactivating giza turns its URLs into 404s.
  - Verifies **AC-4**.
- **Apartment:** badge and facts, `Accommodation` JSON-LD, and the label rule across the three type sets. Verifies **AC-5**.
- **Map:**
  - with a URL, the iframe has the right title and sandbox;
  - with no URL, the address and directions link remain;
  - a non-Google URL is refused by the form and the API (`422`).
  - Verifies **AC-6**.
- **No popup:** no public page HTML contains the popup markup or loads its island, and `/admin/promotions` returns 404. Verifies **AC-7**.
- **Sitemap:** contains no inactive branch, no unpublished record, and `/` only when it is the chooser. Verifies **AC-8**.
- **Book Now:** the disabled button on header, cards, and detail pages, with `data-branch`. Verifies **AC-9**.
- **Accessibility:** axe and the 320 px check on the chooser, a branch home, an apartment detail page, and Contact. Verifies **AC-10**.
- **Settings and branch form:** the settings form has no contact fields, and a branch phone change shows on the footer at once. Verifies **AC-11**.
- **Branch create:**
  - form and API-A2 create three unpublished pages with sections and an audit row;
  - a rollback leaves nothing;
  - an Editor gets the denied page or `403`.
  - Verifies **AC-12**.
- **CMS selector:** the Rooms list for `?branch=demo-giza` shows only its listings, and a forged branch id on create is refused. Verifies **AC-13**.
- **Enquiry:** sent from `/demo-giza/contact`, it stores giza's id, and a Receptionist of new-cairo cannot see it. Verifies **AC-14**.
- **API:** P1 to P4 and A1 to A3, including `401`, `403`, `404`, `409`, `422`, and the `onlineBookingEnabled` refusal; OpenAPI freshness. Verifies **AC-15**.
- **Reserved slugs:** `about` is refused by the schema and by a raw SQL insert. Verifies **AC-16**.
- **Default branch guard:** deactivating `new-cairo` from the form or API-A3 gives `422` with the status field error. Verifies **AC-12**.
- **Not-found shells:** `/luxor` renders the brand 404, and `/new-cairo/nope` the branch 404, both with status `404`. Verifies **AC-4**.

### Existing files the change touches (checklist)

Beyond the files named above, these reference promotions, the flat cache tags, settings contact fields, or unprefixed routes, and must change or be deleted:

- **Application and domain:** `src/application/settings/site-settings.ts` (tags), `src/application/content/page-commands.ts`, `catalog-commands.ts`, `catalog-queries.ts`, `src/application/media/media-library.ts`, `src/application/admin/get-overview.ts`, `src/application/promotions/*` (delete), `src/application/public/view-models.ts` (promotion and contact fields), `src/application/ports/repositories.ts` (promotion port, `MediaUsage`), `src/domain/promotions/*` (delete), `src/domain/shared/zoned-time.ts` (promotion-only helpers; keep what others use), `src/domain/auth/capabilities.ts`.
- **Infrastructure and composition:** `src/infrastructure/db/prisma/repositories/promotion-repository.ts` (delete), `admin-overview-reader.ts`, `media-repository.ts` (usage), `src/infrastructure/db/prisma/mappers/content-mappers.ts`, `src/composition/content.ts`, `src/composition/public.ts`.
- **Presentation and app:**
  - `src/presentation/admin/navigation.ts`, `overview/overview-dashboard.tsx`, `content/publication-panel.tsx` (promotion wording);
  - `src/presentation/admin/promotions/*` and `src/app/admin/(protected)/promotions/*` (delete);
  - `src/app/admin/(protected)/settings/page.tsx` (promotion and time zone note);
  - `src/presentation/site/*` (links, header, footer, map, cards);
  - `src/app/globals.css` (popup styles);
  - `src/app/sitemap.ts`.
- **Scripts:** `scripts/audit-production-content.mts`, `scripts/seed-demo.mts`, `prisma/seed-data.ts`.
- **Tests:**
  - unit: `tests/unit/admin/navigation.test.ts`, `tests/unit/auth/authorization.test.ts`, `authorization-sweep.test.ts`, `tests/unit/content/promotions-pages.test.ts` (delete), `tests/unit/domain/promotion.test.ts` (delete), `tests/unit/content/components.test.tsx`, `forms.test.ts`, `tests/unit/public/*`, `tests/unit/application/use-cases.test.ts`;
  - integration: `tests/integration/promotions-enquiries.test.ts` (keep the enquiry part), `public-site.test.ts`, `content-*.test.ts`, `admin-queries.test.ts`, `branches.test.ts`, `schema.test.ts`, `constraints.test.ts`;
  - e2e: `public-site.spec.ts`, `content.spec.ts`, `visual.spec.ts`, `security.spec.ts`, `admin-shell.spec.ts`, `branch-roles.spec.ts`, `promotion-popup.spec.ts` (delete), `tests/e2e/support/accounts.ts`, `prepare-database.mts`, `fixtures/public-content.mts`.
- `src/generated/prisma/*` is regenerated, not edited. The `Promotion` model and its `User` relation stay in `schema.prisma`.

## Migration plan

**Strategy**: no data migration. One constraint migration, plus a URL move covered by permanent redirects.

**Phases**:
1. Migration `…_reserve_legacy_branch_slugs`: drop and recreate `Branch_slug_check` with `about`, `contact`, `rooms`, and `facilities` added. Applied with `npm run db:deploy`.
2. Deploy the code. Old URLs start redirecting with `308`, and canonicals and the sitemap switch to branch URLs in the same release.

**Rollback**: revert the release. The constraint is stricter but harmless for the old code, so it can stay.

**Risks**:
- Search engines cache `308`s, so the destination table must be right on first release. It is unit tested and checked with `curl` during verification.
- A large visual baseline update can hide a regression. Baselines are reviewed page by page.

## Build plan

The brief's task order (data, domain, application, infrastructure, API, UI). Each group is tested before the next.

1. Migration and domain list for the new reserved slugs, with schema and SQL tests. Satisfies **AC-16**.
2. Domain:
   - `branchInputSchema` (create and partial update, map allowlist, `onlineBookingEnabled` refusal);
   - `switchTarget`;
   - `stayLabel`;
   - room input with `accommodationType`, `bedroomCount`, and `bathroomCount` (apartment-only counts allowed, both optional, ≥ 0);
   - `defaultPageSections` moved to `src/domain/content`;
   - settings form schema without the contact fields;
   - `promotions:manage` removed and the promotion domain code deleted.
   - Satisfies **AC-3**, **AC-5**, **AC-6**, **AC-7**, **AC-11**, **AC-12**.
3. Application:
   - `ListBranches`, `GetBranch`, and `ManageBranches` (create with page seeding and audit, update with audit and tag invalidation);
   - `PublicSite` per branch;
   - branch-aware `CatalogCommands`, `CatalogQueries`, and `PageCommands` and their tags;
   - media invalidation per branch, with branch hero usage;
   - `SubmitEnquiry` with branch and the `ListEnquiries` filter;
   - promotion use cases, ports, view models, and overview counts removed;
   - the authorization sweep updated.
   - Satisfies **AC-4**, **AC-11**, **AC-12**, **AC-13**, **AC-14**.
4. Infrastructure: `PrismaBranchRepository` (`listActive`, `listAll`, `create` in a transaction with pages, `update`); room repository accommodation fields; the promotion repository and mappers removed; `composition/public.ts` getters per branch with the new tags. Satisfies **AC-4**, **AC-5**, **AC-12**.
5. API: contracts, the seven Route Handlers, the routes registry, and `npm run openapi`. Satisfies **AC-15**.
6. Public UI:
   - the route move into `[branch]`;
   - the branch layout and the two not-found pages;
   - the chooser, redirect, and holding page;
   - the `next.config.ts` redirect table;
   - header, switcher, footer, and mobile menu;
   - links carrying the branch;
   - badges and facts;
   - `LocationMap` per branch and the home location block;
   - Book Now context;
   - per-branch JSON-LD, canonicals, and breadcrumbs, and the sitemap;
   - popup removal.
   - Satisfies **AC-1** through **AC-10**.
7. CMS UI:
   - the branch selector on the Pages, Rooms, and Facilities screens;
   - the branch select on create forms;
   - accommodation type and counts on the listing form;
   - the branch list, new, and edit screens;
   - the settings form trimmed with its note;
   - navigation (Branches added, Promotions removed);
   - promotion routes and overview widgets deleted;
   - the enquiry branch filter and column.
   - Satisfies **AC-7**, **AC-11**, **AC-12**, **AC-13**, **AC-14**.
8. Seed and scripts:
   - `scripts/seed-demo.mts` adds `demo-giza` (inactive) with three pages, two facilities, one room, and one apartment from the demo media, plus `--activate-giza` to switch it on locally. Every demo slug is new, because listing and facility slugs are unique across branches (for example `giza-garden-room`, `giza-family-apartment`, `giza-pool`, `giza-gym`);
   - `scripts/audit-production-content.mts` checks branch contact instead of settings contact and drops its promotion checks.
   - Satisfies **AC-3** (demo).
9. Tests:
   - the unit, integration, and E2E scenarios above;
   - public E2E specs moved to branch URLs;
   - `promotion-popup.spec.ts` deleted and replaced by the no-popup test;
   - visual baselines updated page by page.
   - Satisfies every AC.
10. Docs: route map, branch model (slug fixed once created, which is stricter than "after first activation"; the default branch guard), content model, promotions (removed), data model (`Promotion` retired, new reserved slugs), seo, api-contracts, user roles, test matrix, roadmap row, M5 brief status, evidence report. Satisfies every AC (record).

## Consequences

**Positive**:
- Each branch has its own indexable site with one implementation, and opening a branch needs no deploy.
- Cache isolation between branches is explicit and tested.
- Contact and map data have one home (the branch), so they cannot drift from the settings copy.
- The dead promotion code and its tests leave the codebase.

**Negative / tradeoffs**:
- Every public URL changes. Search engines must follow the redirects, and a short ranking dip is possible.
- The redirect target is a constant. Deactivating `new-cairo` later needs a one-line change and a deploy.
- The visual baselines and most public E2E specs change in one milestone, so the review must be careful.
- Settings keeps unused contact columns until a later contract migration.

**Neutral**:
- `Page.canonicalPath` keeps paths inside the branch. The public path is derived from the branch slug.
- `Promotion` rows stay in the database, unused.

## Follow-up

- [ ] Contract migration after launch: drop `Promotion` and the retired `SiteSettings` contact and map columns.
- [ ] M10 enables `onlineBookingEnabled` once its prerequisites (VAT, WhatsApp) exist; Book Now then links to `/{branch}/book`.
- [ ] M11 adds the sync fields to the branch form; M12 builds the full branch admin.
- [ ] After merge, `/sync` records the `[branch]` route convention in `AGENTS.md` (brief, "After merge").

## References

**Project sources**:
- `docs/delivery/milestones/m5-branch-websites.md` (the brief: tasks, acceptance criteria, out of scope)
- ADR 026 (branch websites, routes, reserved slugs, tags, accommodation type, maps), ADR 027 (popup retirement), ADR 006 (section registry), ADR 017 (branch ownership), ADR 009 (server components)
- `docs/requirements/assumptions-and-open-questions.md`: Q-41, Q-42, Q-43, Q-47, Q-52, and the owner decisions of 2026-11-07 above
- `docs/domain/branch-model.md`, `docs/api/api-contracts.md` (API-P1 to P4, API-A1 to A3), `docs/frontend/route-map.md`, `docs/frontend/seo.md`
- Spec 0001 (M4 HTTP layer, branch schema, `findDefault`, audit log)
- Existing code: `next.config.ts` (legacy redirects), `src/composition/public.ts` (cached getters), `src/application/cache/cache-tags.ts`, `src/presentation/site/location-map.tsx`, `src/presentation/site/cta-link.tsx`, `prisma/seed-data.ts` (`defaultSections`)
- `AGENTS.md` rules (thin handlers, logic in `src/domain` and `src/application`, server-enforced scope)

**Practices & standards**:
- Single-hop permanent redirects and canonical URLs for URL moves
- Tag-based cache invalidation scoped to the data that changed
- Progressive enhancement (native `<details>` and GET forms)
