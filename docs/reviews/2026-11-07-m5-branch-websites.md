# Review, m5-branch-websites, 2026-11-07

**Reviewed by**: Sonnet 5.5 (author on a different model per the review setup)
**Scope**: 141 tracked files plus new untracked files (generated code and visual snapshots ignored), uncommitted
**Verdict**: Changes requested

## Summary
M5 moves the public site under `/{branch}`, adds the branch chooser, branch CRUD (use cases, Server Actions, staff API, public API), per-branch cache tags, legacy 308 redirects, per-branch JSON-LD and sitemap, and removes the promotion code. Authorization-before-data-access, CSRF (the `staffRoute` wrapper handles origin checks on POST/PATCH; Server Actions use Next's origin check), the map allowlist (checked on write and again in `publicBranch`), branch isolation in public queries, cache key and tag naming, the reserved-slug list (domain and migration match) and the default-branch guard all check out. The headline issue is SEO: Home, About, and Contact titles and descriptions are identical across branches, so the multi-branch site ships duplicate titles. A few minor loose ends follow.

## Major
### 🟠 Duplicate titles and descriptions across branches for Home, About and Contact, `src/app/(marketing)/[branch]/page.tsx:20`, `src/app/(marketing)/[branch]/about/page.tsx:20`, `src/app/(marketing)/[branch]/contact/page.tsx:36`
**Problem**: `branchTitle()` (which appends "at {branch name}" once there are 2+ branches) is applied only to the Stay and Facilities index pages. Home uses `page.seoTitle ?? settings.defaultSeoTitle` (absolute title). About uses `seoTitle ?? page.title ?? "About"` and Contact uses `seoTitle ?? title ?? "Contact"`, both through the `%s | siteName` template. `defaultPageSections` and `ManageBranches.create` seed pages with `seoTitle = null` and the fixed titles "Home", "About", "Contact" (`src/domain/content/default-sections.ts:170`), and neither `prisma/seed-data.ts` nor the e2e fixture sets `seoTitle`. About and Contact descriptions fall back to the same site-wide default. Home's description does fall back to `branch.summary`, so it is distinct.
**Why it matters**: As soon as a second branch is active, `/new-cairo/about` and `/giza/about` (likewise contact, and both homes when no SEO title is set) share one `<title>`, one meta description, and one OG title. That is exactly the duplicate-title regression the brief asked to watch for. It dilutes ranking and makes the two branches indistinguishable in search results and shares. The unit tests for titles cover only the index pages.
**Suggested fix**: Apply the same distinguishing rule to the managed pages. When the page has no explicit `seoTitle` and 2+ branches are active, compose the title with the branch name (as `branchTitle` does), and use the branch name or summary in the description fallback. Alternatively, seed a branch-specific `seoTitle` and `seoDescription` when a branch is created. Add a test asserting distinct titles per branch for all five page types.

## Minor
### 🟡 A newly created branch is ACTIVE with no published pages, so an indexable holding page and a chooser card go live, `src/application/branches/manage-branches.ts:84`, `src/app/(marketing)/[branch]/page.tsx:42`
**Problem**: `create` seeds the three pages with `isPublished: false`, and the status defaults to ACTIVE. The branch appears in the chooser, switcher, and API immediately. Its home renders the "Our new website is being prepared" holding hero with no `noindex` (unlike the root holding page, which sets `robots: noindex`), under the generic default title. The sitemap correctly omits the unpublished home, so it is also inconsistent: an indexable page that the sitemap does not list.
**Why it matters**: Thin, duplicate-title pages become indexable and visitors can click through to an unfinished site.
**Suggested fix**: Default new branches to INACTIVE (or require published Home before activation), or set `robots: noindex` on the holding state and hide branches without a published Home from the chooser and switcher.

### 🟡 Unbounded `unstable_cache` entries from URL-supplied slugs, `src/composition/public.ts:81`, `:111`, `:131`
**Problem**: `getActiveBranchBySlug(slug)` keys the cache on the raw URL segment, and the room and facility getters key on the raw detail slug. Unknown values cache a `null`. Any crawler or scanner hitting `/random-N` or `/new-cairo/stay/random-N` creates a new entry each time, and these only expire when the `branches` or branch tags are invalidated.
**Why it matters**: Slow cache and disk growth driven by anonymous traffic (the room and facility variants pre-exist but the branch segment now makes the top-level path scannable too).
**Suggested fix**: Do not cache negative lookups by arbitrary slug (cache the active branch list and resolve the slug from it in memory, which is also one cache entry fewer per request), and validate slug shape (`SLUG_PATTERN`, max length) before keying.

### 🟡 Branch header nav always links Facilities, even when the branch has none, `src/presentation/site/site-links.ts:17`
**Problem**: `siteLinks` hides the Stay link when the branch has no listings but always shows Facilities, although `PublicBranch.hasFacilities` exists and the switcher uses it.
**Why it matters**: A branch with no published facilities links to an empty listing page (a thin page, not a 404).
**Suggested fix**: Pass `hasFacilities` into `siteLinks` and hide the link when false, matching the Stay link.

### 🟡 Admin pages list shows stale `canonicalPath` when no branch is resolved, and branch pages are stored with legacy paths, `src/domain/content/default-sections.ts:170`
**Problem**: `REQUIRED_PAGES` still carries `canonicalPath` values "/", "/about", "/contact", which are now redirecting legacy URLs. They are persisted per branch row on create and surfaced in `PageDto`/view models. The admin list papers over it with `pagePath()` when a branch is present.
**Why it matters**: Misleading data that any later consumer (sitemap, API) would trust.
**Suggested fix**: Store the branch-relative path, or stop persisting and deriving it, in a follow-up.

### 🟡 `changedFields` compares decimals by strict equality, `src/application/branches/manage-branches.ts:215`
**Problem**: `from !== to` on latitude/longitude. If the column scale is smaller than the input precision, the stored value never equals the submitted one, so every save logs a phantom change and rewrites the row (and expires the branch cache).
**Why it matters**: Audit noise and needless cache expiry.
**Suggested fix**: Round the input to the column scale in the schema, or compare with the same rounding.

### 🟡 Stale documentation of removed promotion code, `docs/security/security-controls.md:67`, `docs/architecture/module-boundaries.md:8`, `src/app/globals.css:203`
**Problem**: The security-controls "Promotion safety (implemented...)" section, the module-boundaries row ("promotions until M5") and the `promotion-in` keyframes are left over. A zoned-time comment still mentions promotion schedules. The Prisma `Promotion` model remains (a deliberate expand/contract choice, which is fine if recorded).
**Why it matters**: Docs claim controls exist for code that is gone (project rule: keep docs in sync).
**Suggested fix**: Mark the section as removed in M5, update the module row, delete the dead keyframes, and note the pending contract migration for the table.

## Nits
- ⚪ `src/application/enquiries/submit-enquiry.ts:83`, the branch lookup runs before the throttle check, so an invalid-slug flood costs a DB query per request; swap the order or check the throttle first.
- ⚪ `src/application/public/public-site.ts:62`, `toPublic` loads each branch's hero image with one query per branch (N+1); fine at 2 to 3 branches, batch if the list grows.
- ⚪ `src/infrastructure/http/legacy-redirects.ts:5`, trailing-slash variants such as `/about/` take two hops (Next's slash redirect, then the 308). Only worth fixing if logs show it.
- ⚪ `src/app/sitemap.ts:30`, branch contact and address edits do not move any `lastmod`; fine, but note it.

## Strengths
- Authorization is the first statement in every `ManageBranches`, `ListBranches`, `PageCommands`, `CatalogCommands` and `ListEnquiries` method, and the enquiry branch filter can only narrow inside `branchScope` (an out-of-scope slug resolves to no filter, never to another branch's data).
- Branch isolation is enforced by id in every repository query. Public API routes go through the same cached getters as the pages, so a listing slug owned by another branch 404s and inactive branches are invisible. The cache keys name the branch id, and every tag names the branch slug. `ManageBranches.update` and `CatalogCommands` expire exactly the branch's tags plus `branches` when the catalog shape changes, and media usage maps to the owning branch's tags (including the new BRANCH hero usage and the replace-media path).
- Map URLs are allowlisted on write (domain schema) and re-checked in `publicBranch`, with the CSP `frame-src` pinned to google.com, so a bad DB value cannot render.
- Legacy redirects live in one data table, every destination is final (single 308 hop), the reserved slug list matches between `RESERVED_BRANCH_SLUGS` and the migration, and the migration fails loudly on conflicts.
- The default-branch deactivation guard is enforced in the use case and so covers both the form and the staff PATCH. The staff routes get CSRF from `staffRoute`, and the new route-handler architecture test pins the promotion removal.

## Test coverage
Coverage is broad: domain, use-case (authorization sweep), repository integration (branch isolation, enquiries branch scope, migration), API integration, sitemap, and e2e specs. Gaps: no test asserts distinct titles and descriptions per branch for About, Contact and Home (the finding above); no test for a newly created branch's public visibility or indexability; no test that the Facilities nav link follows `hasFacilities`; the decimal round-trip in `changedFields` is untested.

## Responses (author, 2026-11-07)

| Finding | Response |
| --- | --- |
| 🟠 Duplicate titles and descriptions for Home, About, Contact | **Fixed.** `managedPageMetadata` in `src/app/(marketing)/site-content.tsx`: an explicit SEO title wins; otherwise, with two or more active branches, Home's title is the branch name and About and Contact read "About at {branch}". Descriptions fall back to the branch summary. With one branch, titles are unchanged. A new E2E test asserts that all ten titles across both branches are distinct |
| 🟡 New branch live with no published pages | **Fixed.** A new branch now defaults to `INACTIVE` (API and form). A branch home whose page is not published gets `robots: noindex`. Unit tests updated |
| 🟡 Unbounded cache entries from URL slugs | **Fixed.** `getActiveBranchBySlug` resolves from the cached active-branch list, so no cache entry per slug. Room and facility slugs that do not match the slug pattern (or exceed 120 characters) return not found without touching the cache. Well-formed but unknown detail slugs still cache a `null` per branch, as before M5 |
| 🟡 Facilities link always shown | **Fixed.** `siteLinks(slug, stayLabel, hasFacilities)` hides it when the branch has no published facility; unit test added |
| 🟡 Stored `canonicalPath` values | **Deferred** (follow-up, noted in the evidence report). The public path is derived everywhere with `pagePath()`; the column keeps the path inside the branch, which is what the unique `(branchId, canonicalPath)` constraint expects. Dropping or recomputing it is a contract-migration task |
| 🟡 Decimal comparison in `changedFields` | **Fixed.** Coordinates are rounded to the column scale (6 decimals) in the branch schema, so an unchanged form compares equal and writes nothing; unit test added |
| 🟡 Stale promotion docs and dead CSS | **Fixed.** Security controls (section replaced by "Promotion popup (removed in M5)" and a new "Branch sites" section), module boundaries, the `promotion-in` keyframes, and the zoned-time comment |
| ⚪ Branch lookup before throttle | **Fixed.** The throttle check now runs first |
| ⚪ N+1 hero images, trailing-slash double hop, sitemap `lastmod` for contact edits | Accepted as is (two or three branches; no evidence of trailing-slash traffic); recorded as limitations |
