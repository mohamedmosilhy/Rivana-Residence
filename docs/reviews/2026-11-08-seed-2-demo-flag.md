# Review, pre-m6-repairs (SEED-2, `--demo` flag on the one seed), 2026-11-08

**Reviewed by**: Claude Opus 5.5 (independent review subagent; author in a different session)
**Scope**: 11 files, uncommitted (working tree against HEAD dea9a68): 7 changed tracked files, 1 deleted (`scripts/seed-demo.mts`), 3 new (`prisma/seed/demo.ts`, `prisma/seed/options.ts`, `tests/unit/seed/options.test.ts`)
**Verdict**: Changes requested

## Summary

The change adds step 5, `demo`, to the one seed. It runs only with `npm run db:seed -- --demo`. The flag check is a small pure function that runs before any database or password work, and any other flag is an error. The demo step creates the fictional branch `demo-giza` (active) by reusing the real photos the content step already uploaded, and it does nothing when the branch already exists. The old `scripts/seed-demo.mts` and `db:seed:demo` are gone, and nothing live still points at them. The code is a faithful copy of the E2E fixture, and the tests are good. The one real problem is the production guard. It only checks `NODE_ENV=production`, and on the planned VPS an operator's SSH shell will almost never have `NODE_ENV` set (Next.js sets it inside `next start`, and it is not in `.env.example` or the server config list). So the main control of this task does not cover the main way the seed is run in production.

What I checked by hand:

- **Leftovers.** `db:seed:demo`, `seed-demo`, and `--activate-giza` now appear only in old specs (`docs/specs/0001`, `0002`), old reports, old reviews, the brief's task title (which correctly says "removes `db:seed:demo`"), and the unit test that proves `--activate-giza` is now refused. Nothing live is left.
- **Faithfulness to `seedSecondBranch`** (`tests/e2e/fixtures/public-content.mts:548`). The branch data, the three pages and their hero copy, the room, the apartment, and the two facilities are the same. The intended differences are: status is always `ACTIVE`; photos come from the real library (`IMAGES` in `prisma/initial-content/content.ts`) and not the fixture set, with a sensible match for each (wide exterior as branch hero, double room, twin room, pool, gym, exterior for the split sections); the audit row says `STAFF` with the seed admin's id instead of `SYSTEM` with no id, which matches how the content step already records its actions; and errors name what failed. All fine.
- **`prisma db seed` path.** `prisma.config.ts:12` runs the same command, so `npx prisma db seed -- --demo` goes through the same check. Prisma 7.10 does not seed during `migrate dev` or `migrate reset` (confirmed in the SEED-1 review), so no automatic path passes `--demo`.
- **`npm run db:seed` calling tsx directly.** `prisma/seed.mts:17` loads `dotenv/config` itself, and ESM runs that import before the flag check, so a `NODE_ENV` in `.env` is honored. The only lost thing is Prisma's "Running seed command" banner. No behavior change.
- **Other callers of `runSeed` with `demo: true`.** Only `tests/integration/seed.test.ts`. No production code imports `prisma/seed/`.
- **Tests run by me.** `npx vitest run tests/unit/seed`: 2 files, 6 tests passed. `tests/integration/seed.test.ts` on `rivana_test`: 5 tests passed (18 s).

## Major

### 🟠 The production guard misses the usual production shell, `prisma/seed/options.ts:21`

**Problem**: `--demo` is refused only when `NODE_ENV === "production"`. On the Hostinger VPS (ADR 023) the app runs under systemd with `next start`, and Next.js sets `NODE_ENV=production` for its own process. An operator who logs in over SSH and runs `npm run db:seed` gets a plain shell. `NODE_ENV` is not in `.env.example`, it is not in the server config list in `docs/operations/deployment.md:31`, and `dotenv` only loads what `.env` contains. So in that shell `NODE_ENV` is unset, and `npm run db:seed -- --demo` passes the check and writes the demo data to the live database.

**Why it matters**: The demo branch is created `ACTIVE`, so the live site would at once show a branch chooser with "Rivana Giza (demo)", fake phone, fake address, and a fake map pin. Staff can switch it off in the dashboard, but visitors and search engines can see it first, and cached public pages keep it until the cache is cleared. The risk is larger than with the old separate script: the seed rule (`docs/engineering/agent-workflow.md:57`) makes re-running `npm run db:seed` on the server a normal step after every feature, so the dangerous command is now one flag (or one shell-history recall) away from the routine one. The old script had the same weak check, so this is not new, but this task names the production guard as its key control, and the residual risk is not written anywhere.

**Suggested fix**: Add a second signal that is always present in production. The best one already exists: `.env.example` says production must set `APP_URL` to the final HTTPS host, and the server `.env` (which `dotenv` loads) carries it. Refuse `--demo` when `NODE_ENV` is `production` **or** when `APP_URL` is set and its host is not `localhost`, `127.0.0.1`, or `::1`. Keep `resolveSeedOptions` pure (it already receives `env`), and add unit cases for an HTTPS `APP_URL` with `NODE_ENV` unset. Also add one line to `docs/operations/deployment.md` ("Initial content") saying `--demo` is never run on a server and how the check decides. If the owner prefers the simpler route, add `NODE_ENV=production` to the server `.env` and the deployment checklist, and write in `migrations-and-seeding.md` that the guard depends on it.

## Minor

### 🟡 A missing photo can leave half a demo branch that a re-run will not fix, `prisma/seed/demo.ts:52`, `prisma/seed/demo.ts:123`

**Problem**: The photo ids are looked up lazily. Only the branch hero (`exteriorWide`, line 84) is resolved before the branch is created. The other seven (`double1`, `double3`, `twin1`, `twin2`, `pool01`, `gym02`, `exterior`) are resolved later, after the branch, its pages, and the room rows already exist. The media library has a `DELETED` status (`prisma/schema.prisma:71`), so a staff member who deleted one of these photos, or a library that only partly matches, makes the step throw halfway. The next run sees `demo-giza` by slug (line 39) and prints "already exists; nothing changed", so the broken branch stays. The calls are separate repository writes with no transaction, and the docs do not say how to recover. The error text "run the content step first" is also misleading, because the content step skips itself whenever any content exists, so it cannot be "run first" on such a database.

**Why it matters**: This is local data only, so the harm is small, but the result is an active branch with an empty room list and unpublished pages, and the only fix is resetting the local database. Later milestones will add more demo data to this same step (M6 to M9), so the "created means complete" assumption will matter more.

**Suggested fix**: Resolve all photo ids up front, before `branch.create`, and fail with a list of the missing file names (the old script did this with `missing`). Word the error as "the library does not have the seeded photos …; seed demo data on a freshly seeded database". Add one line to `migrations-and-seeding.md`: if the demo step fails partway, reset the local database and seed again. Add an integration case where one photo is marked `DELETED` and check that no branch is written.

### 🟡 An older local database keeps an inactive `demo-giza`, and the way to switch it on was removed, `prisma/seed/demo.ts:42`

**Problem**: The old `db:seed:demo` created `demo-giza` as `INACTIVE` unless `--activate-giza` was passed. Any local database seeded that way (likely the owner's own `rivana` database) already has the branch. The new step sees the slug and says "demo-giza already exists; nothing changed", so the branch stays inactive, while the docs now say the demo branch is **active** (`docs/database/migrations-and-seeding.md:47`). `--activate-giza` now fails as an unknown flag, and nothing says what to do instead.

**Why it matters**: The owner reviewing locally may run `--demo`, see no chooser, and think the feature is broken.

**Suggested fix**: Either print the current status in the "already exists" message and say how to switch it on (Admin > Branches), or add one sentence to the docs for databases seeded by the old command. Do not add code to change an existing branch's status; leaving existing data alone is right.

## Nits

- ⚪ `tests/e2e/fixtures/public-content.mts:30`, `DEMO_IMAGES` is still exported, but its only outside user was the deleted script; it can be module-private now.
- ⚪ `tests/e2e/fixtures/public-content.mts:552`, the `active` option of `seedSecondBranch` has no caller left (`tests/e2e/prepare-database.mts:100` never passes it), and its doc comment still describes it. Drop it or leave a note; the fixture was meant to stay untouched, so this is the owner's call.
- ⚪ `prisma/seed/index.ts:86`, `runSeed` trusts `demo: true` without any check of its own. Today only the entry file and a test call it. A one-line `NODE_ENV` refusal inside `seedDemo` would be cheap defense in depth.
- ⚪ `package.json` and `prisma.config.ts:12` now hold the same seed command twice; a comment in one pointing at the other would stop them drifting.
- ⚪ `npm run db:seed --demo` (without the `--`) is eaten by npm as an npm option, and the real seed runs without the demo. Harmless, but a short "note the `--`" in `prisma/seed.mts:7` would save a confused minute.
- ⚪ `prisma/seed/demo.ts:44`, with no `orderBy`, a staff upload that happens to share a seeded file name (for example `exterior.jpg`) may win the `Map` at random. The old script took the oldest. Adding `orderBy: { createdAt: "asc" }` and keeping the first match makes it deterministic.
- ⚪ `docs/delivery/milestones/m5-branch-websites.md:94` still says "inactive by default, switchable to active locally". It is an accepted milestone brief, so leaving it as history is fine.

## Strengths

- The flag check is pure, runs first, and refuses unknown flags. A typo like `--demos` cannot silently run something else, and the unit test also proves the removed `--activate-giza` now fails loudly instead of being ignored.
- No new uploads: the demo reuses the 33 real photos, and the integration test checks the media count stays at 33. The `ok()` helper names which write failed, which the fixture copy did not.
- `runSeed` now keeps going after the content step instead of returning early, so the demo step also runs on an already seeded database. The log lines say clearly what happened.
- Docs (`migrations-and-seeding.md`, `agent-workflow.md`, the brief) are updated in the same change, and the planned M6 to M9 demo data is now attached to the right file.

## Test coverage

Covered: every branch of `resolveSeedOptions` (no flag in any environment, `--demo` outside production, refusal in production, unknown flags), and, on real PostgreSQL, "no demo without the flag", "the demo creates an active branch with 3 published pages, 2 facilities, a room and an apartment, both published, and reuses the photos", and "a second run changes nothing". I ran both and they pass.

Not covered: the missing-photo path in `seedDemo` (throw before any write), the demo on a database where the content step was skipped, and the order in `prisma/seed.mts` (flag check before credentials and database). The author checked the last one by hand with a dead database URL, which is fair for a tiny entry file. Whatever guard change follows from the Major finding needs its own unit cases.
