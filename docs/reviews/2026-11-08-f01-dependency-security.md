# Review, F01 dependency security, 2026-11-08

**Reviewed by**: GPT-6 Astra, separate reviewer assigned by the coordinating Codex author.
**Scope**: Three uncommitted files against `main` at `16d6733`, on `m5-f01-dependency-security`: `package.json`, `package-lock.json`, and `docs/delivery/risks-and-constraints.md`.
**Verdict**: Approve the dependency change. No findings introduced by this diff. Full E2E acceptance remains unresolved as described below.

## Summary

The change addresses F01 with eight pinned direct package updates and three pinned transitive overrides. The lockfile matches the manifest, related Next.js and Vitest packages remain aligned, and no application, database, or API contract changes are included. The current framework constraint is updated without rewriting historical reports.

## Security and compatibility

The reviewer independently ran `npm audit --omit=dev --json` on Node 22.23.2 and npm 11.21.0. It exited 0 with zero vulnerabilities. The earlier saved audit contained 12 affected package entries, including the applicable Next.js Server Actions denial of service. Next.js 16.4.5 is beyond that advisory's patched 16.4.1 release. This application exposes Server Actions, so the fix addresses a concrete relevant attack surface. See the [maintainer advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r).

The three overrides at `package.json:87` are patch updates within every current consumer's declared range:

| Override | Consumers checked | Compatibility |
| --- | --- | --- |
| `fast-uri` 3.1.9 | AJV under Prisma development tooling | Satisfies `^3.0.1` |
| `source-map-js` 1.2.2 | PostCSS, Tailwind, css-tree, magicast | Satisfies `^1.2.1` |
| `vite` 7.3.7 | React plugin, Vitest, Vitest mocker | Satisfies all listed Vite peer ranges |

The overrides remove the affected versions without forcing a major upgrade. `npm ls` for every changed direct dependency and override exited 0. Lockfile inspection found no nonregistry download URLs. The `why-is-node-running` downgrade to 3.2.1 follows Vitest 5.1.0's exact upstream dependency, rather than an unrelated manual change.

The complete `npm audit --json` still exits 1: 27 affected package entries (14 high, 11 moderate, 2 low, zero critical). Every reported node is marked development only in the lockfile. These include Lighthouse tooling and the TypeScript ESLint dependency chain; they are not covered by the zero production result. Further tooling updates need their own compatibility assessment. Blindly accepting the audit's suggested ESLint configuration downgrade would be inappropriate.

## Validation

Reviewer execution:

| Check | Result |
| --- | --- |
| `npm test`, Node 22.23.2 | 46 files, 908 tests passed |
| Production audit | Zero vulnerabilities |
| Complete audit | 27 development package entries, as above |
| Selected dependency tree and manifest/lockfile consistency | Passed |
| `git diff --check` | Passed |

The author reports passing format, lint, and typecheck; 225 integration tests; `npm run build -- --webpack`; 13 branch E2E tests; and 21 authentication E2E tests with one intentional skip. Those commands were not repeated by this reviewer, and their raw logs were not retained. The build evidence establishes the webpack build only, not a successful default Turbopack build.

The author reports the full E2E run as 77 passed, 2 failed, 13 skipped, and 97 not run. Both failures are the desktop/mobile zero CSP violation assertions. The reviewer inspected the current error artifact, which records `script-src eval` on `/new-cairo`, and the installed Zod capability probe, which attempts `Function("")` unless `jitless` is configured. No application configuration of that flag exists.

The [preceding staff API review](./2026-11-08-staff-api-fixes.md) recorded this same CSP event before F01. That supports treating the failure as an existing compatibility issue, rather than a new defect established by this diff. It does not establish full runtime equivalence with a separately built baseline. The CSP gate and the 97 unexecuted cases remain open; this source review does not waive them or certify release readiness. You still make the task acceptance decision.
