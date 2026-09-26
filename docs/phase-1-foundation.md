# Phase 1 foundation handoff

Status: **Ready for review**  
Completed: 2026-09-25  
Scope: project foundation only

## Outcome

Phase 1 establishes a reproducible Next.js App Router project with strict TypeScript, enforced module boundaries, validated environment parsing, centralized design tokens, local fonts, minimal public and admin shells, automated tests, accessibility checks, and CI configuration.

The shells contain no database, authentication, CMS behavior, reservation logic, rates, availability, or promotion-management feature. Promotion implementation remains in its roadmap phase.

## Locked toolchain and dependencies

The lockfile is npm lockfile version 3. Direct dependency versions are exact rather than ranges.

| Package/tool | Version or constraint | Purpose |
| --- | --- | --- |
| Node.js | `22.23.2` in `.nvmrc` and `.node-version`; package engine `>=22.23.0 <23` | Runtime supported by the confirmed cPanel account |
| npm | `11.7.0` | Package manager and lockfile owner |
| Next.js | `16.3.3` | App Router framework |
| React / React DOM | `19.2.0` | UI runtime |
| TypeScript | `5.9.3` | Strict static typing |
| Tailwind CSS | `4.3.0` | CSS processing and semantic theme exposure |
| Zod | `4.6.5` | Environment input validation |
| ESLint / Next config | `9.36.0` / `16.3.3` | Code-quality and dependency-boundary enforcement |
| Prettier | `3.6.2` | Deterministic formatting |
| Vitest | `5.0.2` | Unit and architecture tests |
| React Testing Library | `16.3.0` | Component tests |
| Playwright | `1.63.0` | Desktop/mobile browser tests |
| axe Playwright | `4.10.2` | Automated accessibility scans |

## Implemented source tree

```text
.
├── .github/workflows/ci.yml
├── .21st/
│   ├── DESIGN.md
│   └── design.json
├── src/
│   ├── app/
│   │   ├── (marketing)/
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── admin/
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── fonts.ts
│   │   ├── globals.css
│   │   └── layout.tsx
│   ├── infrastructure/server/runtime.ts
│   ├── lib/env/
│   │   ├── public.ts
│   │   ├── schema.ts
│   │   └── server.ts
│   └── presentation/
│       ├── admin/admin-shell.tsx
│       ├── design/
│       │   ├── brand-mark.tsx
│       │   └── marketing-shell.tsx
│       └── ui/foundation-notice.tsx
├── tests/
│   ├── e2e/shells.spec.ts
│   ├── unit/
│   │   ├── environment.test.ts
│   │   ├── foundation-notice.test.tsx
│   │   └── import-boundaries.test.ts
│   └── setup.ts
├── eslint.config.mjs
├── next.config.ts
├── package-lock.json
├── package.json
├── playwright.config.ts
├── postcss.config.mjs
├── tsconfig.json
└── vitest.config.ts
```

## Architecture and implementation decisions

- The root layout owns document markup, metadata, and both local font variables. Marketing and admin layouts remain nested layouts, avoiding multiple-root-layout navigation reloads.
- App Router pages and presentation components remain Server Components because Phase 1 requires no browser state or event handlers.
- ESLint prevents presentation and route code from importing infrastructure or server environment modules. Separate rules define the future domain and application dependency directions.
- `server-only` guards protect server environment and infrastructure entry points. An architecture test proves an invalid presentation-to-infrastructure import is rejected.
- Server and public environment values have separate entry points. Zod produces readable startup-boundary errors, and production requires an explicit persistent media root.
- Local Jost and Marcellus files are loaded once with `next/font/local`; no browser request to an external font provider is required.
- Brand, neutral, status, spacing, radius, shadow, focus, and motion tokens are centralized in `globals.css`. The 21st design review led to replacing component-level literal colors with semantic tokens.
- No shadcn/ui primitive was installed because neither shell needs an interactive primitive. This avoids adding unused source or dependencies.
- Playwright starts the optimized production build and tests both desktop Chromium and a Pixel 7 viewport.

## Files added and changed

Added:

- application, presentation, environment, and server-boundary files under `src/`;
- unit, architecture, browser, and accessibility tests under `tests/`;
- Node/npm locks, package manifest and lockfile, TypeScript, Next.js, Tailwind/PostCSS, ESLint, Prettier, Vitest, and Playwright configuration;
- GitHub Actions workflow;
- `.env.example` and repository ignore files;
- `.21st` design context;
- four Phase 1 screenshots;
- Next.js-generated `AGENTS.md` guidance and its `CLAUDE.md` pointer.

Changed:

- `docs/README.md`, `docs/roadmap.md`, `docs/deployment.md`, and `docs/hosting-preflight.md` to record the approved phase boundary and confirmed Hosting.com/cPanel constraints.

Removed: none.

## Configuration and environment

Copy `.env.example` to the environment-specific secret store and set:

| Variable | Exposure | Rule |
| --- | --- | --- |
| `APP_URL` | Server only | Absolute application URL; Phase 10 also uses it as the single canonical/search origin |
| `MEDIA_STORAGE_ROOT` | Server only | Absolute persistent path outside a release directory; required in production |

No database configuration or migration exists in Phase 1. The media root is a validated contract only; upload/storage behavior begins in a later approved phase.

## Verification evidence

Run from the repository root:

| Command | Result on 2026-09-25 |
| --- | --- |
| `npm ci` | Passed; clean lockfile install, 472 packages, 0 vulnerabilities |
| `npm run format:check` | Passed |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | Passed; 3 files, 4 tests |
| `npm run build` | Passed; `/` and `/admin` statically generated with Next.js 16.3.3 |
| `npm run test:e2e` | Passed; 4/4 tests across desktop and mobile Chromium, including axe scans |
| `git diff --check` | Passed |
| `21st review src/app src/presentation` | No actionable component usage issues; remaining informational color literals are the centralized token definitions themselves |

The CI workflow reproduces clean installation, formatting, lint, typecheck, unit tests, production build, Playwright browser installation, and E2E tests. The hosted GitHub Actions run is pending the first push; the equivalent local commands above passed.

The local workstation currently runs Node `24.11.1`, so npm reports the expected engine warning during installation. The project and CI are locked to Node `22.23.2`, matching the version confirmed on cPanel. A hosted Node 22 CI result remains pending the first push.

## Visual evidence

| Surface | Desktop | Mobile |
| --- | --- | --- |
| Public shell | [phase-1-public-desktop.png](./screenshots/phase-1-public-desktop.png) | [phase-1-public-mobile.png](./screenshots/phase-1-public-mobile.png) |
| Admin shell | [phase-1-admin-desktop.png](./screenshots/phase-1-admin-desktop.png) | [phase-1-admin-mobile.png](./screenshots/phase-1-admin-mobile.png) |

The public shell retains Rivana's restrained plum, warm-gold, Marcellus, and Jost identity. The admin shell deliberately uses the same tokens with a quieter operational layout, so no second theme is introduced.

## Acceptance criteria mapping

| Criterion | Evidence | Status |
| --- | --- | --- |
| Clean clone installs and runs using documented versions and commands | Exact direct dependency versions, npm lockfile, Node/npm version files, `npm ci` result | Met locally; locked Node 22 hosted CI pending push |
| Public and admin shells render without business or fake content | `/` and `/admin` static build output, E2E assertions, screenshots | Met |
| Design tokens are centralized with no ad hoc second theme | `src/app/globals.css`, shared brand mark, 21st review | Met |
| CI reproduces local quality checks | `.github/workflows/ci.yml` and passing equivalent local command set | Configured; hosted run pending push |
| No schema, auth, CMS, or public feature leaked into Phase 1 | Source tree and package manifest contain none of these implementations | Met |
| Client code cannot import server-only infrastructure | ESLint boundary configuration and passing architecture test | Met |
| Invalid production environment fails clearly | Passing `environment.test.ts` assertions | Met |
| Empty shells meet a basic accessibility baseline | axe checks pass on public/admin at desktop/mobile sizes | Met |

## Known limitations and deferred work

- GitHub Actions cannot produce a hosted run until the repository changes are pushed.
- The final local verification ran on Node 24.11.1 because the workstation has no Node version manager installed; CI and deployment remain pinned to Node 22.23.2.
- The 21st catalog search returned HTTP 401 in this environment. Its local design review still ran successfully, and no external catalog component was needed for these non-interactive shells.
- The shells are intentionally nonfunctional. Authentication, database persistence, CMS controls, media uploads, contact forms, promotions, booking handoff, and production content are deferred to their approved phases.
- Deployment to the cPanel staging subdomain is not part of Phase 1 and remains deferred until the deployment phase. Cloudflare is not required for this foundation.
- Automated accessibility checks are a baseline, not a substitute for the manual keyboard and assistive-technology reviews required as interactive features are added.

## Phase boundary

**Phase 2 has not started.** It requires explicit client acceptance of this Phase 1 foundation.
