# Content model

## Strategy

Use structured entities for rooms, facilities, site settings, social links, media, and enquiries. Use a small allowlisted section system for the Home, About, and Contact pages. This gives editors useful control without creating a generic page builder or moving layout decisions into JSON.

The React component registry owns layout. The database owns content and ordering.

## Page sections

Each `PageSection.type` maps to one versioned Zod payload schema and one presentation component. Editors can edit approved fields, hide optional sections, and reorder only where a page policy permits it.

| Type | Structured content | Media roles | Intended use |
| --- | --- | --- | --- |
| `HERO` | eyebrow, title, summary, primary CTA label/intent | background or primary | Home and simple page intros |
| `RICH_TEXT` | heading, portable rich-text document | optional primary | supporting editorial copy |
| `IMAGE_TEXT_SPLIT` | eyebrow, heading, body, image side, CTA | primary | Home/About narrative |
| `GALLERY` | heading, layout variant | ordered gallery | property visual storytelling |
| `FEATURE_GRID` | heading, bounded item array | optional per-item through associations | small brand/benefit lists |
| `ROOM_GRID` | heading, limit, featured-only flag | none | dynamic query of published Rooms |
| `FACILITY_GRID` | heading, limit, featured-only flag | none | dynamic query of published Facilities |
| `CONTACT_CTA` | eyebrow, heading, body, form-enabled flag | optional background | reusable contact block |
| `STATS` | bounded label/value items | none | About facts |

`ROOM_GRID` and `FACILITY_GRID` never duplicate room/facility copy in their payload. They hold display configuration and query canonical entities.

## Page policies

### Home

Required composition:

1. `HERO`
2. `IMAGE_TEXT_SPLIT` or intro `RICH_TEXT`
3. `ROOM_GRID`
4. `FACILITY_GRID`
5. lifestyle `IMAGE_TEXT_SPLIT`
6. `CONTACT_CTA`

The editor changes copy/media and can hide optional lifestyle content. Core hero and discovery sections cannot be deleted.

Phase 5 enforcement: sections are seeded per page and never added or deleted; required sections (Home: Hero, Room grid, Facility grid, Contact block; About: Hero, story Image and text, Contact block; Contact: Hero, Contact block) cannot be hidden; the Hero stays first and the Contact block last.

### About

Required hero, story split, and contact CTA. Optional stats, gallery, and room grid. The page should preserve the reference's property exterior and editorial quote rhythm without forcing the old exact grid.

### Contact

Required hero/contact information and enabled contact form. Optional map and supporting rich text. Map coordinates/embed configuration live in Site Settings so they remain consistent.

### Room and facility detail

These are entity templates, not PageSection documents. Their fields and media determine the composition. This avoids storing the same room data in two systems.

## Rich text

Use a limited portable document schema:

- paragraphs, headings level 2–4, ordered/unordered lists, links, bold, italic, and line breaks;
- no arbitrary scripts, iframes, inline styles, classes, or raw HTML;
- links validated for protocol and decorated safely when external;
- rendering through a controlled node map with semantic HTML.

A plain textarea is sufficient for short descriptions and opening hours. Rich text is used only where longer editorial structure is genuinely helpful.

Implemented in Phase 5 (`src/domain/shared/rich-text.ts`): paragraphs, headings 2–4, bulleted and numbered lists, and line breaks, as a strict node allowlist edited through a plain-text format. Bold, italic, and links are deferred. `src/presentation/design/rich-text-view.tsx` renders the document through a fixed node map.

## Media references

Content records refer to `MediaAsset` IDs through relational join records. Do not place storage URLs in payload JSON. Associations may provide an `altOverride` only when the same image has a different contextual meaning; otherwise the asset alt text is canonical.

Decorative images are explicitly flagged at usage level and render with empty `alt`. Editors receive guidance and validation rather than being allowed to leave meaningful alt text blank silently.

## SEO content

Pages, rooms, and facilities each expose optional SEO title, description, and OG media. Empty values fall back through:

```text
entity override -> generated entity summary -> site default
```

Canonical paths are application-controlled. Editors do not enter arbitrary canonical hosts.

## Initial content mapping from the reference

- Home hero, brand introduction, rooms, facilities, lifestyle story, contact CTA.
- About welcome, exterior story, quote/stats, featured rooms, contact CTA.
- Rooms become three marketing records initially: Studio With Balcony, Studio With Pool View, Deluxe Double.
- Facilities initially include Gym and Swimming Pool. “Cafe” and “Wellness & Spa” remain unpublished until real content and approved imagery exist.
- Reference room prices and booking calendars are discarded.
- Reference room facts are drafts pending client verification.

## Editorial guardrails

- Character limits match layout and SEO needs and are shown in the CMS.
- Slug edits after publication require confirmation and a redirect plan.
- A publish validator reports missing title, summary, hero, gallery alt text, and required SEO-derived fields.
- Draft preview is authenticated and noindexed.
- Section schemas carry a `schemaVersion`; future migrations upgrade payloads explicitly.

## Future localization

Do not add translation tables in the first release. Keep UI labels out of database content and avoid concatenated sentences so a later locale strategy can add localized page/entity variants. Locale-specific slugs and fallback rules require a separate ADR when requested.
