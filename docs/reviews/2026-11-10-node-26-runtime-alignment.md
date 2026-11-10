# Review, m6-inventory-and-availability, 2026-11-10

**Reviewed by**: gpt-6-astra (author on gpt-6.1-sol)
**Scope**: 12 files, uncommitted, plus the lockfile inspected separately
**Verdict**: Approve

## Summary

The maintenance change aligns the Mac runtime, project pins, package engine, Node typings, and current hosting documentation on the owner approved Node 26.13.0 LTS target. The diff contains no application, schema, production package version, or M6-T10 changes. The lockfile changes are limited to root metadata, `@types/node`, and its `undici-types` dependency, and the existing CI jobs read the updated `.nvmrc`. No findings were identified; owner acceptance of this maintenance result is still required.

## Strengths

- Both runtime version files agree with the active normal and interactive Mac shells. The engine admits the selected Node 26 release while excluding Node 27, and the unchanged npm 11 range admits the installed npm 11.20.0.
- The runtime report separates local evidence from future Linux CI and VPS verification, retains historical task evidence, and discloses the existing audit findings and upstream warnings. The hosting checklist captures the Linux `libatomic` requirement documented by the [official Node 26.13.0 release notes](https://nodejs.org/en/blog/release/v26.13.0).
- Broad regression evidence covers a clean install, Prisma generation, strict type checking, unit tests, database concurrency tests, the production build, and Chromium E2E. No unrelated dependency updates were introduced.

## Test coverage

No new application behavior needs a new test in this change. The existing suites provide appropriate regression coverage for the runtime and typings update. The reviewer inspected the supplied clean install, aggregate, integration, E2E, and deprecation logs: they record 67 unit files with 1,373 tests, 29 integration files with 391 tests, and 175 Chromium E2E passes with 30 designed skips. The `DEP0205` stack points to the installed `@tailwindcss/node` loader, and the existing media filesystem tracing warning remains disclosed.

Reviewer verification:

- `node --version`, `npm --version`, and the same checks in `zsh -lic`: Node 26.13.0 and npm 11.20.0. The interactive shell selects `/opt/homebrew/bin/node`.
- `npm run typecheck`: passed on Node 26.13.0.
- `npm ls @types/node undici-types --depth=0`: root Node typings resolve to 26.6.6.
- `brew list --versions node node@24`: Node 26.13.0 bottle revision 2 is installed, and Node 24.21.0 bottle revision 2 remains available.
- A local assertion script verified matching package and lockfile metadata, both version pins against the running interpreter, and that only the root, `@types/node`, and `undici-types` lock entries differ from accepted commit `91caa05`. Installed Next.js, Prisma, Prisma Client, Vitest, Playwright, and sharp engine ranges all admit Node 26.13.0.
- The same assertion script compared the supplied audit JSON files: the full vulnerabilities object equals the accepted baseline, and the production audit reports zero findings.
- `git diff --check`: passed. The remaining Node 22 and Node 24 references in current topic documents describe historical verification or the retired cPanel host.

The reviewer did not repeat the clean install, full aggregate, database suite, or browser suite, and did not run remote Linux CI or provision a host. This approval makes no claim that those remote environments have been verified. The separate runtime maintenance change does not advance M6 beyond its accepted 9 of 10 tasks.
