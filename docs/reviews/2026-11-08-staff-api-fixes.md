# Review, m5-staff-api-fixes, 2026-11-08

**Reviewed by**: gpt-6-astra (independent reviewer, author on Codex)
**Scope**: 16 files, uncommitted against `167610c`, including the new cache adapter unit test. The separate engineering audit report was not changed.
**Verdict**: Approve

## Summary

The F02 cookie migration and F03 cache adapter fix implement the approved behavior. The new cookie reaches both admin pages and staff REST endpoints, while the retired name is ignored. Composition selects immediate Route Handler expiry and preserves CMS `updateTag`; authorization, transactions, schemas, and dependencies are unchanged. No unresolved findings remain in the reviewed diff; the verification caveats below remain for owner acceptance.

## Resolved review feedback

The regression at `tests/e2e/branch-websites.spec.ts:317` originally reused a fixed branch slug, causing a retry after creation to fail with `409`. The author added `testInfo.retry` to the slug. The reviewer inspected the correction and considers this minor finding resolved.

## Strengths

* A separate cookie name avoids ambiguous same name cookies with different paths. Integration and browser tests exercise a valid token under the retired name, followed by successful sign in with both cookies present.
* The cache implementation follows the installed Next.js guidance: `revalidateTag(tag, { expire: 0 })` for immediate expiry from Route Handlers, `updateTag` for Server Actions. It preserves tag deduplication and the application port.
* Browser tests use actual sign in cookies and the production cache runtime, covering the two failures that mocked HTTP tests could not detect.

## Deep review paths

| Path | Review conclusion |
| --- | --- |
| `src/infrastructure/auth/cookie-config.ts:5`, `src/infrastructure/auth/better-auth.ts:73`, `src/proxy.ts:32` | One shared prefix and root path; HttpOnly, SameSite, host scope, and production Secure remain in force. The proxy remains an optimistic check only. |
| `src/composition/auth.ts:75`, `src/infrastructure/auth/staff-session.ts:14`, `src/app/api/v1/_http/routes.ts:263` | Database session, active account, current role, and assignments are resolved on the server. Unsafe methods still pass the origin check before reaching a use case. |
| `src/composition/api.ts:71`, `src/composition/content.ts:73`, `src/infrastructure/cache/next-cache-invalidator.ts:10` | REST explicitly supplies the route adapter. Existing CMS callers receive the Server Action adapter by default. |
| `src/application/branches/manage-branches.ts:68`, `src/application/branches/manage-branches.ts:117`, `src/application/branches/list-branches.ts:15` | Capability checks precede repository access. Create and update retain their audit and transaction behavior; listing retains branch filtering. |
| `src/composition/public.ts:76` | Public cache entries contain public view models and never resolve a staff principal, including requests carrying the new root cookie. |
| `src/app/api/v1/_http/routes.ts:34` | The explicit context overload is a type compatibility adjustment. The runtime handling of omitted test context is unchanged. |

## Edge cases

| Case | Expected behavior and evidence |
| --- | --- |
| Only retired cookie | Admin redirects to sign in; authoritative session resolution ignores the old name. Unit, integration, and browser coverage. |
| Retired and new cookies coexist | New session is accepted at admin and staff API paths. Browser migration regression. |
| Missing, expired, revoked, tampered, or inactive session | Refused by the existing database resolver. Integration coverage and browser revocation replay; replay uses a separate context to preserve the stale form test. |
| Hostile or missing origin | Unsafe REST methods are refused before mutation. Existing HTTP tests plus a real cookie jar request with a foreign Origin. A positive authenticated HTTP control distinguishes origin rejection from missing cookies. |
| Editor, Manager, or another branch | Existing capability and assignment checks remain authoritative. New browser role and branch assertions supplement the authorization sweep. |
| Cached absent branch, activation, rename, deactivation | Immediate public reads see 404, 200, the updated name, then 404. The regression exercises real Next cache invalidation. |
| CMS mutation | Retains `updateTag`, with a focused adapter test and existing CMS browser coverage. |
| Concurrent writes or database failure | Transaction and error behavior are unchanged. This task adds no lock, inventory, money, or idempotency behavior. Cache expiry remains after a successful repository write. |

## Test coverage and verification limits

The reviewer ran `npx vitest run tests/unit/application/cache-invalidation.test.ts tests/unit/security/security-headers.test.ts tests/unit/api/http-layer.test.ts` with Node 22.23.2: **3 files, 55 tests passed**. `git diff --check HEAD` passed. No database reset, application mutation, or build was run by the reviewer.

Author supplied results, not independently rerun here: formatting, lint, typecheck, **908 unit tests**, **225 integration tests**, and `npm run build -- --webpack` passed. The default Turbopack production build is blocked by an environment `EPERM` while creating or binding a worker port. These results do not constitute an all green default build or E2E gate.

The first full E2E attempt reported **75 passed, 4 failed, 13 skipped, 97 blocked**. Two revoked session cases had a test interaction that has since been corrected by isolating the REST replay context. The other two failures are CSP zero violation assertions under the webpack fallback. Targeted rerun results will be recorded by the author in the review package.

The reviewer independently reproduced the CSP event on `/new-cairo`: `script-src eval` at `/_next/static/chunks/8064-8125b5be39f32bed.js:1:1740`. The emitted code is Zod's JIT capability probe, which calls `Function("")`, catches the CSP refusal, and falls back. Its source is `node_modules/zod/src/v4/core/util.ts:517`. The client import path through `src/presentation/site/branch-switcher.tsx:7` and the branch domain barrel, the dependency lockfile, and the CSP configuration are unchanged by this diff. This supports classifying the failure as a compatibility issue in an unchanged dependency path exposed by the webpack fallback. A baseline production bundle was not built, so baseline runtime equivalence is not claimed. The CSP gate remains unresolved and must stay visible in owner acceptance; this source review does not waive it.
