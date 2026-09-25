# Phase 5 content management handoff

Status: **Accepted on 2026-09-25**  
Completed: 2026-09-25  
Scope: room, facility, page-section, and promotion management with previews and publication. Media upload is Phase 6; the public pages are Phase 7.

## Outcome

Editors can now manage all structured content without editing code:

- **Rooms and facilities:** list, search, and filter; create and edit; reorder; choose images; preview; publish, unpublish, archive, and restore. Administrators can also delete archived records permanently.
- **Pages:** Home, About, and Contact each have a fixed set of sections. Staff edit them through typed forms (no raw JSON or HTML), hide the optional ones, and reorder within the page rules. They can also set search details, preview, and publish or unpublish.
- **Promotions:** list, filter by status and timing, and search. Staff create and edit with a live pop-up preview, schedule in the property time zone, and see a plain-language explanation of which campaign the website will show. Publish, unpublish, archive, and restore are available to editors; permanent delete is administrator-only.

Every change is authorized on the server, validated against the domain rules, and invalidates only the public cache tags it affects. Drafts never invalidate anything public.

## Decisions for the client to confirm

| Decision | Choice made | Why |
| --- | --- | --- |
| Long-text editing | A plain-text format: a blank line starts a paragraph; `## `/`### `/`#### ` starts a heading; `- ` starts a bullet and `1. ` a numbered item; single line breaks are kept | Satisfies "no raw JSON/HTML editor" without a heavyweight editor. Bold, italic, and links are **deferred**. The stored format is a strict node allowlist, so a richer editor can be added later without migrating data. |
| Page structure | Sections are **never added or deleted**. Each page is seeded with its approved sequence. Required sections are locked visible. The Hero always comes first and the Contact block last. | Required sections cannot be removed by accident. The seed runs only for pages with no sections, so re-seeding never overwrites edits. |
| Contact page | Publishing requires its Contact block to show the enquiry form; the About page requires its story ("Image and text") section | Follows `content-model.md`, which the Phase 2 rules did not yet enforce |
| Deleting | Archive is the normal path. Permanent delete exists only for **archived** rooms, facilities, and promotions, only for administrators (new capability `content:delete`), and only after a named confirmation. | Required by the acceptance criteria. Images are never deleted with content. |
| Images | A room or facility chooses a hero and gallery from images **already in the library**. With no library images, the form says so and publishing stays blocked. | The roadmap allows existing-media selection; upload arrives in Phase 6 |
| Preview | Private, noindex preview pages inside the admin, showing content in reading order. The promotion preview uses the real `PromotionCard` component. | The public templates do not exist until Phase 7. Everything under `/admin` is already `noindex` and `no-store`. |
| "View public page" | Shown as the public address in text, not a link, until the public routes exist (a single `PUBLIC_ROUTES_LIVE` switch) | Avoids sending staff to 404 pages |
| Forms | Server-native forms with the Phase 4 patterns. React Hook Form was **not** added. | The approved Phase 4 patterns covered every form, so a second form system and dependency weren't needed. This reverses the plan stated in the Phase 4 handoff. |
| Unsaved changes | Browser warning on reload or tab close for long forms. In-app links are not intercepted. | "Only when meaningful and never traps navigation" |

## Architecture

```text
src/domain/shared/{rich-text,slug,content-fields,zoned-time}.ts   strict document schema, slugs, time zones
src/domain/content/page-sections.ts   + labels, locked sections, order policy, About/Contact rules
src/domain/{rooms,facilities,promotions}/…   + SEO, room features, friendly messages
src/application/content/catalog-commands.ts   rooms/facilities: authorize, slug conflicts, cache tags, moves
src/application/content/catalog-queries.ts    list filters/paging, readiness
src/application/content/{catalog-forms,form-values}.ts   form → input shaping
src/application/content/page-commands.ts     sections, details, moves, publish/unpublish
src/application/promotions/promotion-admin.ts   form parsing (property zone), filters, display explanation
src/composition/content.ts                   wiring for src/app
src/app/admin/(protected)/{rooms,facilities,pages,promotions}/…   routes + thin Server Actions
src/presentation/admin/content/              publication panel, catalog form/table, media selection, previews
src/presentation/admin/pages/                section field registry, section editor, page preview
src/presentation/admin/promotions/           promotion form, display note
src/presentation/features/promotions/promotion-card.tsx   shared with the Phase 7 pop-up
src/presentation/design/rich-text-view.tsx   safe renderer, shared with Phase 7
```

**Section registry:** `SECTION_FIELDS` in `section-fields.tsx` maps each allowlisted section type to exactly one typed editor. The server rebuilds the payload with `sectionPayloadFromForm`, forces `schemaVersion: 1`, drops unknown keys, and validates against the domain schema for that page.

**Cache invalidation (only what changed):**

| Change | Tags invalidated |
| --- | --- |
| Draft room or facility created, edited, archived, restored, or deleted | none |
| Published room or facility edited | `rooms`/`facilities`, `room:{slug}`/`facility:{slug}`; also the new slug tag and `sitemap` **only if the slug changed** |
| Publish, unpublish, or archive a published record | list tag, item tag, `sitemap` |
| Reorder | list tag |
| Page section, details, or order edited while published | `page:{key}` |
| Page publish or unpublish | `page:{key}`, `sitemap` |
| Any promotion change | `promotion:active` |

Each row is asserted in `tests/unit/content/catalog-commands.test.ts` and `promotions-pages.test.ts`, and end to end in `tests/integration/content-management.test.ts`.

## Final fields

**Room:** name, web address (slug; suggested from the name on create), short description, description (paragraphs, headings, lists), size in m², adults, children, beds, view, ordered features (up to 20), featured, search title and description, hero and gallery images, display order, publication status.

**Facility:** the same, minus the room facts and features, plus opening hours.

**Page section:** small heading, heading, visibility (locked for required sections), and the type's fields:

| Section type | Fields |
| --- | --- |
| Hero | title, summary, optional button |
| Text | text |
| Image and text | text, image side, optional button |
| Gallery | layout |
| Room grid, Facility grid | count, featured only |
| Contact block | text, show enquiry form |
| Feature list | 1–8 items |
| Facts and figures | 1–8 items |

Page details: search title and description.

**Promotion:** internal name, headline, message, code, terms, starts and ends (in the property time zone, labelled), show as pop-up, priority.

**No booking fields exist.** No form, DTO, or schema accepts price, rate, availability, reservation, discount, redemption, guest, eligibility, or payment input. This is asserted in `tests/unit/content/forms.test.ts`, which checks that such keys are dropped and absent from every schema, and in `components.test.tsx`, which checks that no form control uses those names. The Phase 2 schema check still guards the database.

## Bugs found and fixed during testing

- **Every Prisma-written timestamp was stored hours off on non-UTC database servers** (this dates from Phase 2). The pg adapter sends and reads instants as zone-less UTC wall time. On Postgres.app (session zone Africa/Cairo) a promotion starting 09:00 Cairo time was stored as 05:00Z instead of 07:00Z. Reads undid the error, which hid it, but raw SQL, database `now()` comparisons, and reports would be wrong. **Fix:** every Prisma connection now sets `-c TimeZone=UTC`: the app client, the seed, the staff CLI, and both test harnesses. A regression test compares the stored epoch; it fails by exactly two hours without the fix. **Existing local rows written before this fix keep their shifted values.** Production (Hosting.com) must be checked at deployment; a server already running in UTC was never affected.
- **The promotion card failed WCAG contrast.** Its gold labels on the warm canvas measured 4.33:1. The card now uses the white surface, where the same gold passes 4.5:1. axe caught this in E2E.
- **Date-time fields overflowed the form** at desktop widths because of the inputs' intrinsic width. Fixed with `min-width: 0`.

## Changed behaviour from earlier phases

- The rich-text schema is now strict. Every document stored so far (`{type:"doc",content:[]}` and bare paragraphs) remains valid.
- Hiding a required section now fails with `VALIDATION` and a message next to the checkbox. Previously it failed with `NOT_PUBLISHABLE` only on published pages.
- A stale or partial reorder now returns `CONFLICT` ("The list changed … reload") rather than `VALIDATION`.
- Readiness messages use section names ("A visible Contact block section is required.") instead of type codes.
- The capability matrix gained `content:delete` (administrator only). `docs/phase-3-auth.md` has been updated.

## Verification

| Check | Result |
| --- | --- |
| `npm run check` (format, lint, typecheck, unit, build) | Pass. All new admin routes are dynamic. |
| Unit and component tests | 27 files, 330 tests pass (109 new) |
| Integration tests (PostgreSQL, real migrations) | 10 files, 113 tests pass (17 new) |
| E2E (Playwright, desktop and mobile Chromium, production build) | 47 passed. 11 were skipped by design: desktop-only or mobile-only flows, plus page publication, which runs once because pages are shared. |

CRUD and publication test matrix:

| Flow | Unit | Integration | E2E |
| --- | :-: | :-: | :-: |
| Room create, edit, features, SEO | ✓ | ✓ | ✓ |
| Room validation failure (focused summary, nothing saved) | ✓ | ✓ | ✓ |
| Duplicate slug → message next to the slug field | ✓ | ✓ | – |
| Hero selection unblocks publish; publish, unpublish, archive, restore | ✓ | ✓ | ✓ |
| Permanent delete: archived only, administrators only | ✓ | ✓ | ✓ (admin deletes; editor sees no button) |
| Reorder: neighbour swap, archived skipped, stale order → conflict | ✓ | ✓ | – |
| Published record stays publishable when edited | – | ✓ | – |
| Facility create and edit | ✓ | ✓ | ✓ |
| Page section edit, required lock, order policy | ✓ | ✓ | ✓ |
| Page publish and unpublish; published edit that would break it → refused | ✓ | ✓ | ✓ |
| Invalid section input → field paths and focused summary | ✓ | ✓ | ✓ |
| Seeded sections valid, ordered, required ones visible, idempotent | ✓ | ✓ | – |
| Promotion schedule in the property time zone, preview, publish | ✓ | ✓ | ✓ |
| Promotion display explanation (showing, outranked, scheduled, and so on) | ✓ | ✓ | ✓ |
| Promotion unpublish, archive, restore, delete | ✓ | ✓ | – |
| Cache-invalidation matrix | ✓ | ✓ | – |
| No booking fields | ✓ | (Phase 2 schema test) | – |

Accessibility: axe reports no violations on the room edit page, promotion form errors, and the About page editor.

- Long forms use fieldsets with legends, per-field hints and errors, and a focused error summary that links to each field.
- Repeatable rows have numbered labels ("Feature 2"), announce every change, and keep focus.
- Every confirmation names its target and states its public impact. A failed action shows its reason inside the dialog, which stays open.
- Page sections are `<details>` disclosures with visible Required and Hidden badges.

Screenshots in `docs/screenshots/`:

- **Rooms:**
  - `phase-5-rooms-list-desktop.png` and `phase-5-rooms-list-mobile.png`
  - `phase-5-room-validation-desktop.png`
  - `phase-5-room-draft-readiness-desktop.png` (readiness issue list)
  - `phase-5-room-publish-confirm-desktop.png`
  - `phase-5-room-preview-desktop.png`
  - `phase-5-room-edit-mobile.png`
- **Facilities:** `phase-5-facilities-list-desktop.png`
- **Pages:**
  - `phase-5-pages-list-desktop.png`
  - `phase-5-page-editor-home-desktop.png` and `phase-5-page-editor-contact-mobile.png`
  - `phase-5-page-section-error-desktop.png`
  - `phase-5-page-preview-about-desktop.png`
- **Promotions:**
  - `phase-5-promotions-list-desktop.png`
  - `phase-5-promotion-form-preview-desktop.png`
  - `phase-5-promotion-display-note-desktop.png`

A full lifecycle recording was not produced. The room and facility lifecycle E2E tests (`tests/e2e/content.spec.ts`) cover the same steps and can be re-run with Playwright tracing (`--trace on`) to produce a step-by-step recording.

## Migrations, configuration, and environment

- There are no schema migrations; the Phase 2 tables already had every field.
- The seed now creates default page sections for pages with none.
- Prisma connections now run their session in UTC (see the timestamp bug above).
- There are no new environment variables and no new dependencies.

## Known limitations and follow-ups

- Rich text has **no bold, italic, or links** yet.
- **Image upload** and alt-text editing come with the Phase 6 media library. Section and Open Graph images also wait for the media picker.
- **"View public page" links and the styled public preview** arrive with the public routes in Phase 7. Flip `PUBLIC_ROUTES_LIVE` then.
- **Reordering happens one step at a time** (Up/Down). Drag-and-drop is not provided.
- **Seeded page copy is marked as draft text** ("Replace before publishing") and must be replaced with approved copy before the pages are published.
- **Local timestamps written before the UTC fix** remain shifted in existing development databases. Re-seed or ignore them; the E2E and test databases are recreated on every run.

## Reviewer decision

Approved by the client on 2026-09-25, including the plain-text formatting rules, the fixed page structure, and the administrator-only permanent delete. Phase 6 was authorized to begin.
