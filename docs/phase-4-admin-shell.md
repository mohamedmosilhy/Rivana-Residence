# Phase 4 admin shell and shared workflows handoff

Status: **Accepted on 2026-09-25**  
Completed: 2026-09-25  
Scope: the admin shell, shared CMS primitives, the settings workflow, and the dashboard overview. There are no room, facility, page, promotion, or media editors; those arrive in Phases 5 and 6.

## Outcome

Staff now work in one admin shell on desktop and mobile. The shell has a sidebar that becomes a modal sheet on small screens, a top bar with an account menu, breadcrumbs, and page headers. It includes all eight approved destinations: Overview, Pages, Rooms, Facilities, Media, Promotions, Enquiries, and Settings. Staff remains an administrator-only destination. The Overview shows real counts and promotion state from PostgreSQL. Administrators can edit site details and ordered social links. Each save is validated and authorized in an application command, protected against stale forms, and invalidates only the public `site-settings` cache tag. Every page state (empty, loading, error, access denied, validation failure, pending, and success) uses shared components.

## Decisions for the client to confirm

| Decision | Choice made | Why |
| --- | --- | --- |
| Who sees what | Editors see Overview and the six content destinations. Administrators also see **Settings** and **Staff**. | Matches the Phase 3 capability matrix: `settings:edit` and `users:manage` are administrator-only. Hidden links are a convenience only; every page re-checks the role on the server. |
| Destinations without editors yet | Pages, Rooms, Facilities, Media, and Promotions show live figures and a short list of what the area will do. They offer no buttons that pretend to work. | The roadmap asks for the destinations now and the editors in Phases 5–6. Real counts keep the pages useful and honest. |
| Enquiries | A read-only inbox with search, a status filter, and pagination | This area demonstrates the shared table, filter, pagination, and empty-state patterns on real data. Marking messages read or archived waits until the contact form exists (Phase 7). |
| Settings fields | Identity (name, tagline), contact and location (phone, email, address, coordinates, Google Maps embed link), footer text, default page title and description, and social links | The social image and logo variants need the media picker, so they arrive with Phase 6. The property time zone is shown read-only because changing it shifts every promotion schedule. |
| Map link | Only `https://www.google.com/maps/embed…` links are accepted | The value becomes an iframe source on the public contact page, so arbitrary origins are refused. |
| Stale edits | A save succeeds only when the settings have not changed since the form was opened. Otherwise the user is told to reload. | Prevents two administrators silently overwriting each other. |
| Booking | Settings shows a read-only **Not configured** status and has no URL field | Required by the acceptance criteria and the booking boundary. |

## Architecture

```text
src/app/admin/(protected)/
  layout.tsx            shell + role-filtered navigation
  loading.tsx, error.tsx  shared loading and failure states
  page.tsx              Overview
  pages|rooms|facilities|media|promotions/page.tsx   destinations (live figures)
  enquiries/page.tsx    read-only inbox (URL-driven filters and pagination)
  settings/page.tsx + actions.ts                     administrator-only
src/composition/admin.ts                 wires use cases to Prisma and the Next.js cache
src/application/settings/site-settings.ts  GetPublic/GetAdmin, UpdateSiteSettings, ReplaceSocialLinks
src/application/enquiries/list-enquiries.ts, admin/get-overview.ts, cache/cache-tags.ts
src/domain/settings/site-settings.ts     settings and social-link rules (Zod)
src/infrastructure/cache/next-cache-invalidator.ts   CacheInvalidator → updateTag
src/infrastructure/db/prisma/repositories/{settings-repository,admin-overview-reader,enquiry-repository}.ts
src/presentation/admin/shell/            AdminShell, AdminNav, MobileNav, AccountMenu
src/presentation/admin/ui/               PageHeader, Badge, DataTable, ListFilters, Pagination,
                                         EmptyState/LoadingState/Panel, AdminErrorState,
                                         form primitives, ConfirmDialog, ToastProvider
```

A settings save runs as follows:

1. The Server Action reads `FormData` and passes the raw values to `UpdateSiteSettings`.
2. The use case authorizes `settings:edit` (so an editor gets `FORBIDDEN` before any validation), parses the version token, and validates with the domain schema. Blank optional fields become `null`.
3. The repository runs `UPDATE … WHERE id = 'default' AND "updatedAt" = $expected` in a transaction. When no row matches, it returns `CONFLICT`, or `NOT_FOUND` if the settings row is missing. Social links are replaced inside the same transaction; array order becomes `sortOrder`.
4. Only after a successful write does the use case call `CacheInvalidator.invalidate(["site-settings"])`, which runs `updateTag("site-settings")`.
5. The public settings query `getPublicSiteSettings()` is cached under that tag and returns visible social links only. Public pages start reading it in Phase 7.

Why `unstable_cache` and not `"use cache"`: `"use cache"`/`cacheTag` need `cacheComponents`, a cross-cutting rendering change that would require Suspense boundaries around every request-time read, including the admin session. That belongs with the public-page work in Phase 7/10. `unstable_cache` supports the same tags and `updateTag` today, so moving to `"use cache"` later changes one function.

## Shared patterns

| Pattern | Component | Behaviour |
| --- | --- | --- |
| Navigation | `AdminNav`, `MobileNav` | `aria-current="page"` on the current destination and its sub-pages. Below 64rem (which includes a 1280px window at 200% zoom) the sidebar becomes a `<dialog>` sheet. The sheet traps focus, makes the page inert, closes on Escape, backdrop click, or navigation, and returns focus to **Menu**. |
| Account menu | `AccountMenu` | A disclosure with `aria-expanded`, not an ARIA menu, because its contents are ordinary links and a button. Escape and outside clicks close it, and focus returns to the trigger. |
| Page header | `PageHeader` | Breadcrumb `nav` with `aria-current`, one `h1`, description, and an actions slot. |
| Tables | `DataTable` | Semantic table with a caption and a row header, inside a focusable, labelled scroll region. |
| Filters and pagination | `ListFilters`, `Pagination` | A plain GET form, so it works without JavaScript and filters survive reloads and shared links. Changing a filter returns to page 1. The page shows "Showing x–y of n", with Previous and Next links. |
| States | `EmptyState`, `LoadingState`, `AdminErrorState`, `DeniedPage` | The empty state names the next step. The loading skeleton pulses (a static skeleton with reduced motion). The error state focuses its heading, shows a support reference but never the error text, and offers **Try again**. |
| Forms | `TextField`, `TextAreaField`, `FieldShell`, `ErrorSummary`, `SubmitButton`, `FormActions` | Labels, hints, and errors are linked with `aria-describedby` and `aria-invalid`. A failed save focuses a summary that links to each field. Typed values survive a failed save. The submit button disables itself while pending. |
| Action placement | `FormActions` | The primary action (Save, and later Publish) sits at the end. Secondary and destructive actions (later Archive and Delete) sit at the start, away from it. Status such as "Last saved … by …" appears on the left. |
| Destructive confirmation | `ConfirmDialog` | A `role="alertdialog"` on a modal `<dialog>`. The title names the target and the body states the impact. Focus starts on **Cancel**, Escape cancels, and focus returns to the trigger. It is used first for "Sign out other sessions". |
| Status feedback | `ToastProvider`/`useToast` | One polite live region, present from first paint, that auto-dismisses after 6 s. Toasts can also be dismissed by hand. |
| Repeatable fields | `SocialLinksForm` | Add, remove, move up, and move down, with focus kept on a sensible control and every change announced. Row errors link to the exact field ("Link 2 link: …"). |

**Primitive choice:** the dialog and sheet use the native `<dialog>` element instead of shadcn/Radix. Browsers now provide the focus trap, inert background, Escape handling, and top layer, so no new dependency was needed. ADR 010 permits selective shadcn; none was needed yet. React Hook Form was also not added: settings uses a server-native form plus one small controlled repeatable list. RHF remains the plan for the larger Phase 5 entity forms.

The admin look is deliberately quiet. It uses Jost headings at modest sizes, flat white panels, and no public display type or motion. Gold appears only as the current-page marker.

## Keyboard and accessibility notes

- **Skip link:** the first Tab stop is "Skip to admin content"; Enter moves focus to `<main>`.
- **Order:** skip link, brand link, navigation, View website, then the account menu, then page content. On mobile it is Menu, the account menu, then content.
- **Sheet:** Menu opens it with focus inside. Tab cycles within the sheet only, and Escape closes it and returns focus to Menu.
- **Account menu:** Enter or Space opens it and Tab moves through the links and Sign out. Escape closes it and focuses the trigger.
- **Forms:** after a failed save, focus lands on the error summary. Each summary link moves focus to its field.
- **Social links:** the Move and Remove buttons carry the row name ("Move up: Facebook"). A move keeps focus on the moved row's control. Add focuses the new row, and Remove focuses the neighbouring row.
- **Status:** colour never carries meaning alone; badges always have text.
- **Reduced motion:** toast entry, the skeleton pulse, and transitions are cut to 0.01 ms.
- **Reflow:** checked at 640 CSS px (1280px at 200% zoom) and on a Pixel 7. Automated checks assert there is no horizontal page scroll. Wide tables scroll inside their own focusable region.
- **axe:** no violations on Overview, the mobile sheet, Settings (clean and with errors), the confirmation dialog, or the filtered Enquiries list.

## Verification

| Check | Result |
| --- | --- |
| `npm run check` (format, lint, typecheck, unit, build) | Pass. All admin routes are dynamic (`ƒ`); `/` stays static. |
| Unit and component tests | 20 files, 221 tests pass (69 new) |
| Integration tests (PostgreSQL 18, Postgres.app) | 9 files, 96 tests pass (16 new) |
| E2E tests (Playwright, desktop and mobile Chromium, production build) | 37 passed. 9 were skipped by design: desktop-only keyboard, zoom, dialog, and settings-write flows, and the mobile-only sheet test on desktop. |

What the tests cover:

- **Component tests** (`tests/unit/admin/components.test.tsx`, `social-links-form.test.tsx`):
  - responsive navigation: the sheet opens, closes, closes on navigation, and returns focus;
  - account menu: Escape and outside-click close it;
  - dialog: focus starts on Cancel, returns on close, and confirm runs the action;
  - forms: the error summary takes focus and re-takes it on repeated failures, and pending submit disables the button;
  - toasts: announced, auto-dismissed, and dismissible by hand;
  - repeatable fields: order, add, remove, move, announcements, and the limit.
- **Unit tests:**
  - settings and social-link rules (`tests/unit/settings/site-settings.test.ts`), including hostile map URLs, non-https social links, duplicate platforms, the coordinate pair, and uploaded files in text fields;
  - the use cases (`settings-use-cases.test.ts`): editors and signed-out users are refused before validation, invalid input writes nothing, stale versions are rejected, and caches are invalidated only after a successful write, with exactly `["site-settings"]`;
  - query parsing and pagination, navigation per role, and date formatting.
- **Integration tests** (`tests/integration/settings.test.ts`, `admin-queries.test.ts`):
  - a save through the command shows up in the **public settings query**, and the cache-invalidation intent is recorded;
  - stale-form rejection;
  - of two concurrent saves of the same version, exactly one wins;
  - editors are refused at the command boundary;
  - social links: ordered replacement, public visibility filtering, and reordering without tripping the unique `sortOrder` index;
  - a failed link insert rolls back the version bump;
  - enquiry paging, filtering, and literal search;
  - overview counts, and active promotion selection that matches the public rule.
- **E2E** (`tests/e2e/admin-shell.spec.ts`):
  - editor navigation through every content destination on desktop and mobile;
  - editors are denied `/admin/settings` directly;
  - the mobile sheet (Escape and focus return);
  - 200% zoom reflow and the keyboard path;
  - the dialog's focus behaviour;
  - enquiries filter through the URL and render HTML/script input as inert text;
  - a settings update shows a toast, persists, and survives a reload;
  - an invalid update produces a focused summary with four linked errors, keeps the typed values, and saves nothing;
  - stale-form conflict;
  - social links: add, validation error, reorder, and save.

**Bugs found and fixed during testing:**

- **Enquiry search treated `%` and `_` as wildcards.** Prisma passes `contains` to `ILIKE` unescaped. The repository now escapes them, and a regression test covers it.
- **Admin dates crashed the page.** `Intl.DateTimeFormat` rejects `timeZoneName` combined with `dateStyle`. The date parts are now explicit, and a unit test covers the formatter.

**Cache invalidation evidence:** `UpdateSiteSettings` and `ReplaceSocialLinks` call the `CacheInvalidator` port with exactly `["site-settings"]`, and only after a successful write. Unit and integration tests assert this. `NextCacheInvalidator` maps it to `updateTag`, the read-your-own-writes form for Server Actions. No path or layout is revalidated for public pages. The action revalidates only `/admin/settings`, so the form receives its new version token.

Screenshots in `docs/screenshots/`:

- `phase-4-overview-desktop.png` and `phase-4-overview-mobile.png`
- `phase-4-menu-sheet-mobile.png`
- `phase-4-account-menu-desktop.png`
- `phase-4-destination-rooms-desktop.png`
- `phase-4-enquiries-desktop.png` and `phase-4-enquiries-empty-desktop.png`
- `phase-4-settings-desktop.png` and `phase-4-settings-mobile.png`
- `phase-4-settings-saved-toast-desktop.png`
- `phase-4-settings-invalid-desktop.png`
- `phase-4-confirm-dialog-desktop.png`
- `phase-4-settings-denied-editor-mobile.png`

## Migrations, configuration, and environment

- There are no schema changes or migrations. The Phase 2 `SiteSettings` and `SocialLink` tables already had every field used here.
- There are no new environment variables and no new dependencies.
- The test setup now runs Testing Library `cleanup` after each test and polyfills `HTMLDialogElement.showModal`/`close` for jsdom. Real dialog behaviour is covered by Playwright.

## Known limitations and follow-ups

- The **logo variants and default social image** fields wait for the Phase 6 media picker.
- **Enquiries** has no read/archive actions or detail view yet. These come with the contact form in Phase 7.
- **Recent activity** lists recently updated records, not an audit log of who did what. Settings is the only record that stores its last editor's name.
- There is **no unsaved-changes warning**. The docs apply one only "when meaningful", and it will be added with the longer Phase 5 editors.
- **Staff management** stays read-only in the UI. The operator CLI remains the way to create, deactivate, and re-role accounts. No roadmap phase schedules a user editor; raise it if one is wanted.
- **`getPublicSiteSettings`** uses `unstable_cache` until Cache Components are adopted (see Architecture above).

## Reviewer decision

Approved by the client on 2026-09-25, including the shared CMS patterns, the settings field list, and the Google Maps embed restriction. Phase 5 was authorized to begin.
