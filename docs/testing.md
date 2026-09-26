# Testing strategy

## Principles

Test business boundaries, authorization, data behavior, and critical user journeys. Avoid tests that merely restate static JSX or chase a coverage percentage.

## Unit tests

Use Vitest for fast domain/application tests:

- room/facility publication readiness;
- slug and ordered-feature rules;
- page-section type/payload validation;
- media deletion/reference policy and lifecycle transitions;
- SEO fallback mapping;
- role authorization policies;
- disabled and future booking launch mapping;
- contact enquiry validation and delivery-result behavior;
- promotion publication window, priority selection, and active-query rules;
- Prisma-to-domain/view-model mappers.

Pure style wrappers do not need unit tests.

## Component tests

Use React Testing Library with accessible queries for behavior-rich components:

- mobile navigation focus/Escape/return;
- gallery buttons, keyboard behavior, status, and reduced motion;
- contact form errors, pending state, and announcements;
- admin repeatable fields and destructive dialog;
- media uploader validation/progress/retry;
- promotion form validation/preview and public popup close/copy/focus behavior;
- Book Now disabled explanation;
- rich-text renderer sanitization/semantic output.

Component tests run in jsdom. `tests/setup.ts` runs Testing Library cleanup after each test and polyfills only `HTMLDialogElement.showModal`/`close`; native dialog focus trapping, inertness, and Escape are asserted in Playwright.

## Integration tests

Run against an isolated PostgreSQL database with real migrations and the Prisma adapter:

- repositories and unique/check constraints;
- publish/unpublish and cache-invalidation intents;
- room/facility CRUD including ordering and media relations;
- media begin/finalize/delete failure paths with a fake storage adapter;
- local-media adapter traversal/symlink/root-containment, atomic finalize, and delete/open contract behavior;
- promotion CRUD, scheduling, active selection, and cache invalidation;
- Better Auth session/role checks and inactive-user handling;
- contact persistence plus fake delivery adapter;
- transaction rollback on conflicts;
- public queries never return drafts.

Test adapters through contracts so a storage/email provider replacement must pass the same behavior suite.

Storage adapters share the contract suite in `tests/support/media-storage-contract.ts`; any new adapter (for example S3-compatible) must pass it unchanged. Media pipeline tests generate their fixtures with sharp (valid formats, EXIF, polyglots, decompression-bomb headers, animation).

Run with `TEST_DATABASE_URL=postgresql://user@host:5432/rivana_test npm run test:integration`. The global setup drops/recreates that database (the name must end in `_test`) and applies all migrations before the suite runs.

## E2E tests

Use Playwright for high-value flows:

1. Admin can log in and log out; invalid login is generic.
2. Unauthenticated users cannot reach protected pages/actions.
3. Editor creates, edits, publishes, and archives a room.
4. Editor creates/updates/publishes a facility.
5. Editor uploads an image, edits alt text, attaches/reorders/replaces it, and cannot delete it while referenced.
6. Home/page content update appears publicly after publish.
7. Public Home, About, Rooms, Room Detail, Facilities, Gym, Pool, and Contact render at desktop/mobile widths.
8. Contact form validates, submits, and stores/delivers once.
9. Book Now is inert, has no fake destination/data, and communicates unavailable integration.
10. Editor publishes/schedules a promotion; the eligible public visitor can copy/dismiss it and expired/draft campaigns do not appear.
11. Sitemap excludes drafts/admin and includes published entities.

Use deterministic local adapters and fixtures; do not call production email/storage/booking systems in CI.

Cross-browser acceptance: `npm run test:e2e:browsers` (sets `CROSS_BROWSER=1`) adds Firefox desktop and WebKit desktop, tablet (iPad), and phone (iPhone 14) projects that repeat the public-site, shell, and security suites. Install the engines once with `npx playwright install firefox webkit`. Playwright's Firefox (155) does not start on macOS 27 ("Could not find profile folder"). On such a Mac, select the WebKit projects with `--project=webkit-*` and run Firefox in Linux CI. Admin journeys stay on Chromium because production auth cookies are `Secure` and WebKit will not keep them on plain-HTTP `127.0.0.1`. Keyboard tests press Option-Tab in WebKit, matching Safari's macOS default.

Auth E2E runs when `E2E_DATABASE_URL` points to a disposable `*_test` database: the Playwright global setup recreates it, migrates, seeds, and provisions separate staff accounts per browser project so sessions and throttle counters never collide.

## Accessibility and visual QA

- axe checks on representative public/admin routes;
- keyboard-only manual pass for header/menu/gallery/forms/dialogs/uploader;
- screen-reader smoke test for navigation, form errors, and booking disabled state;
- contrast and 200% zoom/reflow checks;
- reduced-motion tests;
- a forced-colours (Windows high contrast) check that text and control borders stay distinct from the canvas and decorative edges disappear (`tests/e2e/public-site.spec.ts`);
- screenshot comparisons for every public template's opening screen at desktop (1440px) and phone (Pixel 7) widths (`tests/e2e/visual.spec.ts`);
- interaction and motion checks (`tests/e2e/public-site.spec.ts`, "interaction and motion"): photo-viewer keyboard/focus/swipe, mobile menu inertness and focus containment, scroll reveals, header tuck/return, and reduced motion; unit coverage in `tests/unit/public/motion.test.tsx`;
- a horizontal-overflow sweep of every template at 320, 390, 768, 1024, 1280, and 1440px and a phone touch-target check (`tests/e2e/public-site.spec.ts`);
- `npx tsx scripts/contrast-report.mts` fails when any public colour pairing drops below its WCAG minimum.

Visual snapshots cover major page templates and high-risk interactions, not every pixel of dynamic imagery. Baselines are platform-specific (`*-darwin.png`); after an approved visual change, refresh them with `npx playwright test --update-snapshots` and review the diff before committing.

## Performance and SEO tests

- Lighthouse needs Chrome; without a system install, point it at Playwright's Chromium: `CHROME_PATH="$(node -e 'console.log(require("@playwright/test").chromium.executablePath())')" npm run lighthouse`.
- `npm run lighthouse` audits Home, Rooms, a room detail, and Contact with the desktop profile; `npm run lighthouse:mobile` repeats the same matrix under mobile throttling.
- Lighthouse CI enforces accessibility ≥95, best practices ≥90, SEO ≥95, CLS ≤0.1, and a 260 KB script-transfer ceiling; performance, LCP, and TBT use warning budgets so regressions remain visible without concealing reviewed exceptions.
- Browser tests assert route titles, canonicals, Open Graph URLs, sitemap/robots output, permanent redirects, and the absence of broken same-origin links/images.
- Unit and browser tests validate JSON-LD shape and reject invented offers, prices, availability, ratings, and reviews.
- `npm run audit:content` checks production facts, published content/media readiness, promotion validity, and truthful disabled-booking messaging. It exits 2 while launch inputs are blocked.

The Phase 10 desktop/mobile scores and accepted exceptions are recorded in [phase-10-seo-performance.md](./phase-10-seo-performance.md).

## Security tests

- authorization sweep (`tests/unit/auth/authorization-sweep.test.ts`): every protected application command refuses a signed-out caller, and every administrator-only command refuses an editor, before touching any repository, storage, cache, or clock; a tripwire self-test proves the check would catch a guard placed after a read;
- browser policy (`tests/e2e/security.spec.ts`, `tests/unit/security/security-headers.test.ts`): hardened headers, a fresh nonce per response applied to Next's scripts, zero CSP violations while pages hydrate and navigate, injected inline handlers refused and reported, framing refused, media and crawl files keeping their own policies;
- CSRF/origin and method behavior on route handlers;
- stored-XSS payloads in rich text/contact fields;
- upload MIME/extension/magic-byte/size/dimension mismatches;
- media IDOR/reference deletion;
- local path traversal, encoded separators, symlink escape, executable upload, and direct access to quarantined/non-ready files;
- promotion stored-XSS, invalid schedule, unauthorized publish, and client-clock bypass attempts;
- open redirect and unsafe return-path cases;
- login/contact rate limiting;
- secrets absent from client bundle and logs (bundle scan in the Phase 11 report; the enquiry outage log records only the error class and code).

## Failure and recovery tests

- contact submission during an outage returns an honest error, keeps what the visitor typed, and logs no personal data (`tests/unit/public/enquiry-action.test.ts`);
- a browser aborting mid-upload leaves no record, quarantine file, or object, and a retry succeeds (`tests/integration/media.test.ts`);
- storage failures on upload and delete, delivery failure, stale-form and concurrent-save conflicts, and rollback of multi-row writes are covered in the integration suite;
- backup/restore drill with `scripts/backup.sh` and `scripts/restore.sh` (see [deployment.md](./deployment.md#backup-and-restore-tooling)).

## Coverage

`TEST_DATABASE_URL=... npm run test:coverage` writes unit and integration V8 coverage to `coverage/unit` and `coverage/integration` (HTML plus a text summary). Coverage is a map for finding untested logic, not a target; pages and presentation are exercised by Playwright instead.

## CI gates

Pull requests run format/lint, TypeScript, unit/component tests, integration migrations/tests, production build, and a focused Playwright smoke suite. Main/release runs the full E2E, accessibility, and performance suite. Database migrations receive explicit review and a production backup/rollback note.
