# Review, pre-m6-repairs (PRE-M6-R1, audit F07), 2026-11-08

**Reviewed by**: Claude Opus 5.5 (author on a different model)
**Scope**: 6 files, uncommitted (working tree on `pre-m6-repairs` vs `HEAD`)
**Verdict**: Approve with nits

## Summary

The change removes the built-in admin password `123456` and the `NODE_ENV` switch. The initial seed now needs `SEED_ADMIN_PASSWORD` in every environment and checks it against the staff password policy before it opens the database or the media folder. The credential check (`prisma/seed-admin-credentials.ts`) and the admin creation (`prisma/seed-admin.ts`) are now separate and tested, and an existing admin is still never reset. The code is correct and small. The open points are about the docs and about how strong the tests are, not about the logic: there is no advice for an admin that the old seed already created with `123456`, `.env.example` does not mention the new variable, and one test does not check that the stored hash really matches the password.

What I checked myself:

- Nothing in the repo still uses the old default or the `NODE_ENV` branch. The only `123456` hits outside the new tests are unrelated test strings and the common-password list.
- CI (`.github/workflows/ci.yml`) and the E2E setup never run `db:seed:initial`, so nothing breaks there.
- The check runs before any writes. At `prisma/seed-initial.mts:57-61` it comes before `new PrismaClient` (line 71), `seedDatabase` (line 307), and `LocalMediaStorage.create` (line 91). None of the imported modules does any work when it loads.
- The refusal message lists only the policy problems and never the password.
- I ran the unit file (5 passed) and the integration file against `rivana_test` (3 passed).
- I ran the script by hand with a database address that does not exist and the password `RivanaAdmin-2026-strong`. It stopped with `Refusing to seed: Do not include your name or email address.` and exit code 1, without trying to connect.

## Minor

### 🟡 No advice for an admin the old seed already created, `docs/operations/deployment.md:54`

**Problem**: The rule "an existing admin keeps its password" also keeps any admin that the old seed created with `123456`, for example on a local or staging database. A re-run prints `Admin … already exists; password unchanged.` and gives no warning. The audit's F07 advice says to "check existing exposed environments for accounts created through this path". Neither the docs nor the script mention this.

**Why it matters**: The weak login F07 is about can live on in any database seeded before this change, and the new docs read as though the problem is fully solved.

**Suggested fix**: Add one line under "Initial content". It should say that any database seeded before this change may have `admin@rivanaresidence.com` with the password `123456`, and that the operator should rotate it with `npm run staff -- set-password --email admin@rivanaresidence.com`, which checks the policy and ends all sessions. If you want, the "already exists" log line can repeat that hint. Do not make the seed reset the password, because the task card says it must not.

### 🟡 `.env.example` does not list the new variable, and production gets no storage advice, `.env.example:23`, `docs/operations/deployment.md:53`

**Problem**: The docs say "put it in your own `.env`", but `.env.example` does not list `SEED_ADMIN_PASSWORD`. Its comment ("there is no environment-provided default administrator") now reads as if the environment never supplies an admin password, but the initial seed does read one. For production or staging the docs do not say how to pass the password. Two easy mistakes follow: writing `SEED_ADMIN_PASSWORD=… npm run db:seed:initial` on the command line puts the password in shell history, and adding it to the server `.env` leaves it there in plain text. The staff CLI avoids both problems by taking passwords only from a hidden prompt or stdin.

**Why it matters**: `docs/security/security-controls.md:18` says bootstrap credentials come from "secure environment input" and must be rotated. Without advice, the admin password is likely to stay on the VPS disk or in shell history.

**Suggested fix**: In `.env.example`, add a commented-out `# SEED_ADMIN_PASSWORD=` entry that explains it is used only by `db:seed:initial` and must meet the policy. Also adjust the nearby comment. In `deployment.md`, add one sentence for servers: set the variable only for that one run without putting it in history (for example `read -s` and then `export`), never leave it in the server `.env`, and rotate it with `npm run staff -- set-password` after the first sign-in if it was shared.

### 🟡 The integration test does not show that the stored hash matches the password, `tests/integration/seed-admin.test.ts:26-28`

**Problem**: The "creates" test only checks that the stored password exists and is not the plain text. If the hash were made from the wrong value (an empty string, or the other test password), the test would still pass. Also, the script-level promise "refuses before any database work" is checked only by the author's manual run. The pure function is unit-tested, but nothing automated would notice if someone later moved the check below `new PrismaClient` or `seedDatabase`.

**Why it matters**: This is a High-risk task about authentication setup, and these two properties are its main purpose.

**Suggested fix**: In the "creates" test, use `verifyPassword` from `better-auth/crypto` to show that the stored hash accepts `FIRST`. In the repeat-run test, show that it still accepts `FIRST` and rejects `SECOND`. The hash comparison already shows nothing changed, and this also shows the result is correct. For the script order, you could add a small test that runs `prisma/seed-initial.mts` with no or a weak `SEED_ADMIN_PASSWORD` and a database address that cannot be reached, then checks for exit code 1 and the "Refusing to seed" message. Or you can record that this stays a manual check.

## Nits

- ⚪ `tests/integration/seed-admin.test.ts:44`: the test name says "role, status, and password", but it changes only `active`. Either set a different role first (for example `EDITOR`) and check it is kept, or drop "role" from the name.
- ⚪ `prisma/seed-admin-credentials.ts:32` / `docs/operations/deployment.md:53`: the policy treats "Rivana" and "Admin" (the fixed seed name) and "admin" (the email) as personal words, so `RivanaAdmin-2026-strong` is refused with "Do not include your name or email address". An operator may not see that "your name" means the seed account. Say in the docs that passwords containing "rivana" or "admin" are refused.
- ⚪ `docs/operations/deployment.md:54`: say that re-runs need the variable too, even when the admin already exists and the password will not be used. This is deliberate (the task card requires it every time), but operators may be surprised.
- ⚪ `prisma/seed-admin.ts:11-36`: this creates the same user and account shape as `createStaff` in `scripts/staff-admin.ts:110-170`, which already checks the policy and refuses an existing email. Having two copies is fine for this task. Sharing one helper later would keep the account shape in one place.
- ⚪ `prisma/seed-initial.mts:309-316` (not new): the seed treats any account with the admin email as an `ADMIN` principal, even if it is inactive or has another role. This is out of scope for this task and is noted only so nobody forgets it.

## Strengths

- The check is a small pure function. It runs at the top of the script before any database or media object exists, so a refused run truly writes nothing. I confirmed this with a run against a database address that does not exist.
- The policy is the same one the staff CLI and the app use (`passwordPolicyIssues`), with the seed account as context, so the seed cannot get around the staff rules any more. The refusal never repeats the password, and a unit test locks that in.
- The repeat-run test compares the salted hash before and after. Any re-hash would change it, so this really shows the password was not reset. A third test shows that a deactivated account stays deactivated.
- All the old `NODE_ENV` logic and the `123456` constant are gone. The script header, `deployment.md`, and `security-controls.md` now say the same thing.

## Test coverage

Unit (`tests/unit/auth/seed-admin-credentials.test.ts`, 5 tests, passing): a missing password with any `NODE_ENV`, an empty password, `123456` and other weak passwords outside production, a strong password returned unchanged, and no password in the refusal. Integration (`tests/integration/seed-admin.test.ts`, 3 tests, passing on `rivana_test`): creating the admin, no reset on a repeat run (same hash, one user), and an existing account's status kept. Not covered automatically: that the stored hash matches the supplied password, and that the script refuses before any database or media work (checked by hand only). See the third Minor finding.
