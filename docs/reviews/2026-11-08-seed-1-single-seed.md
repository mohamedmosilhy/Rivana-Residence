# Review, pre-m6-repairs (SEED-1, one seed, includes PRE-M6-R2 / F08), 2026-11-08

**Reviewed by**: Claude Opus 5.5 (independent review subagent; author on a different session)
**Scope**: 17 files, uncommitted (working tree against HEAD 742d9cb)
**Verdict**: Changes requested

## Summary

The change folds three seeds into one entry point. `npm run db:seed` now runs four steps in order: structure, admin, branch, and content. The new branch step fixes F08: it fills the New Cairo branch's contact, address, coordinates, map link, and check-in and check-out times, and it only fills fields that are empty. The refactor of `seed-initial.mts` into `prisma/seed/content.ts` is faithful. The only intended behavior change is that the dead `SiteSettings` contact columns are no longer written, and nothing reads them any more. The code is small, clear, and the tests pass. The main open point is the R2 acceptance rule. It asks for a public browser check, and that check was not done. Two smaller design gaps remain. A field that staff deliberately cleared comes back on a re-run. A content step that fails halfway cannot be repeated, even though the docs call the seed "safe to repeat".

What I checked by hand:

- **Old names.** Nothing live still uses `db:seed:initial`, `prisma/seed-initial.mts`, `prisma/seed-admin*.ts`, or `SETTINGS.phone/email/address/latitude`. The only hits are in old reports and reviews, which are historical. No `src/` code reads the `SiteSettings` contact columns: the admin settings form only edits `siteName`, `tagline`, `footerText`, and the SEO fields.
- **Automatic seeding (point c).** Prisma 7.10 no longer seeds during `migrate dev` or `migrate reset`. Neither command has a seed option in its `--help`. CI (`.github/workflows/ci.yml`) never calls Prisma. The integration and E2E harnesses call `seedDatabase()` from `prisma/seed-data.ts` directly. So the new requirements of `prisma db seed` (`SEED_ADMIN_PASSWORD`, `MEDIA_STORAGE_ROOT`, 33 images) break no script, CI job, or test.
- **The map link (point f).** I fetched the hand-built embed URL over HTTP. Google answered 200, and the page names the place "Rivana Residence, أمام نادي الزهور, قطعه ٤٦ أ منطقه ٣٧, New Cairo 1, Cairo Governorate" with place id `0x145823b01ca6a3c7:0x511d75030d80cacc`. That matches the owner's address ("in front of El Zohour Club, Plot 46 A, District 37"). The `pb` parameter's nesting counts (`!1m18`, `!1m12`, `!3m3`) are also well formed. The link works and points at the right place. I think the hand-built link is acceptable, and the comment in `content.ts` and the note in `deployment.md` say clearly enough where it came from.
- **Tests.** I ran the new and changed tests myself: 7 unit tests passed (`tests/unit/seed`, `tests/unit/auth/seed-admin-credentials.test.ts`), and 7 integration tests passed on `rivana_test` (`seed-branch.test.ts`, `seed-admin.test.ts`).

## Major

### 🟠 R2's "public browser check" is not done, `docs/delivery/milestones/repairs/pre-m6.md:56`

**Problem**: R2 is "done when … a public browser check renders the seeded values." The author could not get the dev server to use the scratch database. In its place, the author added an integration test through `PublicSite.activeBranches()` (`tests/integration/seed-branch.test.ts:87-110`). That test proves the view model carries the seeded values. It does not prove what the Contact page shows: the address lines, the phone and email links, and the map iframe, which also depends on the CSP `frame-src` allowing the embed.

**Why it matters**: This is a High risk task, and the only change visitors see is the Contact page. One acceptance criterion is still unmet. The author was honest about this, and the brief still shows R2 as "In progress".

**Suggested fix**: Do the browser check before R2 is marked done. A likely reason the dev server "did not pick up" the scratch database: public reads are cached on disk in `.next/cache/fetch-cache` and `.next/dev/cache/fetch-cache` (see `deployment.md:44`). The cache keys name the branch but not the database, so a dev server pointed at a new database can still serve the old `rivana` Contact page from cache. Delete both folders, start the dev server attached with `DATABASE_URL` and `DIRECT_DATABASE_URL` set to the scratch database, and open `/new-cairo/contact`. Then check the address, phone, email, and that the map shows the pin. If the owner accepts the integration test instead, record that decision in the brief.

## Minor

### 🟡 A field staff deliberately cleared is filled again on a re-run, `prisma/seed/branch.ts:21`

**Problem**: The fill rule is `current[field] === null`. When staff clear a field in the dashboard, `blankToNull` in `src/domain/branches/branch.ts:46` stores `null`. So the seed cannot tell "never set" from "removed on purpose". Say staff remove `addressLine2` or the map link. The next `db:seed` puts the seeded value back, and visitors see it.

**Why it matters**: R2 says "a repeat seed preserves intended edits", and removing a value is an intended edit. The new seed rule in `docs/engineering/agent-workflow.md:57` says every later task adds a seed step. So re-running the seed in existing environments becomes a normal thing to do, not a rare one. The docs say "a field that already has a value is kept", which is true, but they do not mention this case.

**Suggested fix**: The simplest dependable signal already exists. Every staff save sets `Branch.updatedById` (`branch-repository.ts:255`), and the seed never sets it. Skip the branch step, or fill only when `updatedById` is null, once staff have saved the branch even once. Add an integration test for "staff cleared a field, then re-seed". If the owner prefers to keep the current rule, write the limitation in `migrations-and-seeding.md` and `deployment.md`.

### 🟡 A content step that fails halfway cannot be repeated, `prisma/seed.mts:70-88`

**Problem**: The content step is not one transaction, and it uploads 33 images one by one through the media pipeline before it creates rooms and pages. Suppose it fails partway, for example on a bad image, a full disk, or a media-root permission error. On the next run `mediaAsset.count()` is above 0, so the run prints "Content: skipped; the database already has 0 rooms, 0 facilities, and N images" and exits successfully. The site is left with some images and no rooms, and the files already written stay in the media root. The old `seed-initial.mts` behaved the same way, so this is not a regression. Now, though, it is the production seed, and the docs say "Safe to repeat" (`migrations-and-seeding.md:46`, `deployment.md:56`).

**Why it matters**: During the M6 deployment rehearsal, an operator who follows the docs would re-run the seed after a failure, see a successful exit, and end up with a broken site.

**Suggested fix**: At the least, make the skip message stand out when the counts look partial (some images but no rooms), and add one line to the docs: "if the content step fails, reset the database and clear the media root, then seed again". A stronger option is to decide whether to skip from rooms and facilities only, and reuse images that are already uploaded (match on `originalFilename`, as `scripts/seed-demo.mts` already does).

### 🟡 The content step and the orchestration have no automated test, `prisma/seed/content.ts:102`, `prisma/seed.mts`

**Problem**: The new rule says each seed step ships "with a test" (`agent-workflow.md:57`, `migrations-and-seeding.md:46`), but `seedContent` has none. Nothing automated checks the order of `seed.mts` either: refuse before any database work, then structure, admin, branch, and content, and skip content when content exists. The only evidence is the author's two manual runs on a scratch database. The prior R1 review raised the same gap for the refusal order.

**Why it matters**: The refactor changed `content.ts` (the `IMAGE_DIR` path, the removed settings columns, the `mediaRoot` parameter) and the orchestration. A later change that broke, for example, the `IMAGE_DIR` path, or that moved the credential check below `new PrismaClient`, would not fail any gate.

**Suggested fix**: Add one integration test that runs `seedContent` against `rivana_test` with a temporary media root. It should check the counts (3 rooms, 3 facilities with the Café a draft, 33 images, 3 published pages, social links) and that `SiteSettings.phone` stays null. Optionally, add a script-level test that runs `prisma/seed.mts` with a weak password and a database address that cannot be reached, and checks exit code 1 and the "Refusing to seed" message.

### 🟡 The new seed rule describes a `--demo` flag that does not exist yet, `docs/engineering/agent-workflow.md:57`

**Problem**: "Fictional or demo data goes only behind the `--demo` flag, which is refused in production" is written as if it already works. It is SEED-2, which has not started. Also, SEED-1 and SEED-2 are not listed in any task table. `pre-m6.md` only says R2 is "delivered inside SEED-1".

**Why it matters**: The docs must mark what is implemented and what is planned (AGENTS.md). An agent reading this rule today would look for a flag that is not there.

**Suggested fix**: Mark the flag as planned (SEED-2), and add SEED-1 and SEED-2 rows to the pre-M6 brief's task table with their status.

## Nits

- ⚪ `prisma/seed/branch.ts:19-25`: the read and the update are separate and outside a transaction, so a staff save made between them could be overwritten. This is very unlikely for a manual seed. A transaction, or one `UPDATE … SET col = COALESCE(col, $value)`, would close the gap.
- ⚪ `prisma/seed/branch.ts:19`: `Record<string, unknown>` turns off Prisma's type check on `data`. A future `BRANCH` key that is misspelled or is not a column would be skipped without any error, because it reads as `undefined`, not `null`. Typing `fill` as `Prisma.BranchUpdateInput`, or listing the keys explicitly, would catch that.
- ⚪ `prisma/initial-content/content.ts:193`: `city` holds "New Cairo 1, Cairo Governorate 4735344", so the public third line reads "New Cairo 1, Cairo Governorate 4735344, Egypt". The order also moves "Opposite El Zohour Club" to line 2, where the owner's text put it first. That is fine for now. A postal-code field, or the owner's own order, is a later choice.
- ⚪ `prisma/seed-data.ts:19-20` (not changed in this diff): the comment "Staff accounts are provisioned with `npm run staff -- create`, which never takes a password from the environment" is now misleading next to a seed that does read `SEED_ADMIN_PASSWORD`.
- ⚪ `docs/operations/deployment.md:56`: "Re-running is safe" lists the admin and content rules but not the branch rule (empty fields are filled, and cleared fields come back).
- ⚪ Existing databases (for example the local `rivana`, where the M5 migration copied the older `SiteSettings` address and pin into `Branch`) keep the old address text and coordinates. Only empty fields such as the times and the map link are filled. This follows from the fill rule, and it is worth saying once to the owner so nobody expects the new address there.
- ⚪ `prisma/seed.mts`: every run needs `SEED_ADMIN_PASSWORD`, even when the admin already exists and only a new step needs to run. That is documented. Once steps are added per task, though, it pushes operators to keep the password around. SEED-2 could check the password only when the admin is missing, still refusing before any write.

## Strengths

- The refactor is faithful. Compared with `git show HEAD:prisma/seed-initial.mts`, the order (structure, admin, content guard, content), the guard rule, the image pipeline, and the page section logic are unchanged. The only removals are the dead `SiteSettings` contact columns. The credential check still runs before the database client exists (`prisma/seed.mts:42-50`).
- `tests/unit/seed/branch-details.test.ts` runs the seeded `BRANCH` through `parseBranchUpdate`, the same rules the dashboard and API use. Seeded data can never be data that staff could not save. That is a good guard for future edits to `content.ts`.
- `seedBranchDetails` returns the fields it filled, and the script prints them, so the operator can see what changed. The integration tests cover a fresh fill, a repeat with no change, a kept staff edit, and the public view model.
- The map link is honestly marked as hand-built. It does resolve to the right Google place.

## Test coverage

Covered: the credential policy (unit, 5 tests). Admin creation and no reset on repeat (integration, 3 tests). The seeded branch values pass the domain schema (unit, 2 tests). The branch fill on a fresh database, the repeat, a kept staff edit, and the values reaching `PublicSite.activeBranches()` (integration, 4 tests). I re-ran all 14 and they passed. The author reports the full gates passed (unit 915, integration 232); I did not re-run those.

Not covered: the content step (`seedContent`) and the orchestration and refusal order of `prisma/seed.mts`, which were checked only by the author's manual runs. The "staff cleared a field" case. Preserving an existing Decimal coordinate on re-seed (only phone and check-in time are tested as kept). The rendered Contact page (the browser check in R2, see Major).
