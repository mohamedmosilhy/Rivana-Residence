# Node 26 runtime alignment

Date: **2026-11-10**. Status: **Accepted by the owner**. This is separate maintenance work requested by the owner after accepting M6-T9, not M6-T10. M6-T9 was committed as `91caa05`; M6 remains 9/10 tasks accepted.

## Objective and approved target

The owner chose to upgrade both the Mac and project to **Node 26.13.0 LTS**, replacing the Mac's Node 24.21.0 and the project's Node 22.23.2 pin. The [official release page](https://nodejs.org/en/blog/release/v26.13.0) identifies 26.13.0 as the LTS release. The owner accepted the completed maintenance change on 2026-11-10 and authorized its separate commit.

Risk: **Medium**, because the runtime and Node typings affect the whole application. No application behavior, API, schema, inventory policy, or milestone task was added.

## Changes

- `.nvmrc` and `.node-version` pin 26.13.0. The package engine accepts `>=26.13.0 <27`; npm remains `>=11.7.0 <12`.
- `@types/node` is pinned to 26.6.6, with its required `undici-types` 8.9.0. No production package versions changed.
- Existing CI jobs all read `.nvmrc`, so the pin selects Node 26.13.0 without editing the workflow.
- Root agent context, NFR-12, architecture diagram, deployment ADR 023, hosting guidance, and runtime risk notes now agree. The owner approved the runtime amendment to ADR 023 on 2026-11-10. Historical verification reports retain the versions they actually used.
- Homebrew installed its `node` formula, version 26.13.0 (bottle revision 2), preserving `node@24` 24.21.0. The existing shell path already prefers `/opt/homebrew/bin`, so no shell startup file edits were needed. Homebrew backed up the previous npm/npx links. The resulting npm version is 11.20.0, within the existing project requirement.
- The Linux hosting checklist now calls out `libatomic`, required by the official Node 26 binaries. Actual VPS provisioning and Linux CI execution remain deployment/CI work.

## Verification

Commands run directly on Node **26.13.0**, npm **11.20.0**, PostgreSQL **18.4**:

```sh
node --version
npm --version
/bin/zsh -lic 'node --version; npm --version'
npm install --save-dev --save-exact @types/node@26.6.6
npm ci --no-audit
npm run check
TEST_DATABASE_URL=postgresql://mohamedmosilhy@127.0.0.1:5432/rivana_test npm run test:integration -- --reporter=dot
E2E_DATABASE_URL=postgresql://mohamedmosilhy@127.0.0.1:5432/rivana_e2e_test npm run test:e2e
```

Both shell checks selected 26.13.0 and npm 11.20.0. Clean installation passed and regenerated Prisma Client 7.10.0. `npm run check` passed formatting, lint, typecheck, **67 unit files / 1,373 tests**, and production build. The full Chromium E2E suite passed **175 tests**, with **30 intentionally skipped** by its viewport/project scoping. The PostgreSQL integration suite passed **29 files / 391 tests**, including the inventory, pricing, limiter, transaction, and concurrency cases.

## Warnings and limits

- The existing media-storage dynamic filesystem tracing warning remains in the build.
- Node 26 reports `DEP0205` for `module.register()`. A focused rerun with `node --trace-deprecation node_modules/vitest/vitest.mjs run tests/unit/application/public-rate-limit.test.ts --reporter=dot` passed **11 tests** and traced the warning to the installed `@tailwindcss/node` loader. No application source change was needed.
- The install audit reported **26 development dependency findings** (2 low, 10 moderate, 14 high). `npm audit --json` findings were exactly equal to an audit of the accepted T9 package/lockfile in an isolated temporary directory. `npm audit --omit=dev --json` reported **zero production vulnerabilities**. This runtime update neither introduced nor repairs those existing development dependency findings.
- npm warned about four dependency install scripts lacking an `allowScripts` declaration. Installation, Prisma generation, and the aggregate gates completed successfully; no install policy or dependency script approval was changed.
- Local verification is on macOS. No production host was provisioned or remote CI run triggered, and nothing was pushed.

## Independent review

`gpt-6-astra` independently reviewed the uncommitted runtime change authored by `gpt-6.1-sol`: **Approve**, zero findings ([review](../../reviews/2026-11-10-node-26-runtime-alignment.md)). The reviewer checked installed shell versions, the official release and Linux prerequisite, manifest and lockfile consistency, dependency engine compatibility, CI pin wiring, audit equivalence, and the supplied full-suite logs. The owner accepted this result on 2026-11-10. Commit: `chore(runtime): align Mac and project on Node 26 LTS` (this maintenance commit). M6-T10 remains not started; no push or merge is authorized.
