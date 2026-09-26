# Phase 11 release-candidate report

Status: **Ready for review**

Completed: 2026-09-26

Scope: Phase 10 review, codebase cleanup, suite completion, security hardening, failure and recovery testing, cross-browser and accessibility acceptance, and a restore drill. Base commit `13af0b7`; the release-candidate identifier is the Phase 11 commit once it is approved and committed.

## Outcome

- **Browser security policy is now enforced.** Every rendered page gets a per-request nonce Content Security Policy with no inline or eval script allowance, plus `nosniff`, `X-Frame-Options: DENY`, a strict referrer policy, `Cross-Origin-Opener-Policy`, and a restrictive `Permissions-Policy` on every response. Phase 10 had none of these.
- **Authorization is swept, not sampled.** All 43 protected application commands refuse a signed-out caller before any data access, and every administrator-only command refuses an editor. A tripwire makes any repository, storage, cache, or clock access before the guard fail the test.
- **Contact submissions survive an outage.** A database or filesystem failure used to replace the form with the error page and discard the visitor's message. It now returns an honest "could not send" message, keeps what they typed, and logs only the error class and code, never their details.
- **Interrupted uploads are proven harmless.** An upload aborted mid-stream leaves no record, quarantine file, or object, and a retry succeeds.
- **Backup and restore are scripted and drilled.** `scripts/backup.sh` and `scripts/restore.sh` produce and restore a checksummed database and media backup. The drill restored identical record counts and all 21 images, which the app then served.
- **Cross-browser acceptance.** The public, shell, and security suites pass in WebKit at desktop, tablet, and phone sizes alongside Chromium.
- **Photo viewer layout (found in the Safari review).** On phones the viewer's grid column grew to the photo's natural width, pushing the photo, Close button and next arrow off screen. On desktop the photo was capped at its natural 700 px. The image component also forced a cropping fit, so filling the space would have cropped or stretched the photo. Fixed: the column is capped at the viewport, the photo scales to fit without cropping (`SiteImage fit="contain"`), arrows get their own gutters from tablet width, and thumbnails hide on very short (landscape phone) screens. On desktop the photo went from 672 to 1,039 px wide. A new E2E test checks portrait and landscape in every Chromium and WebKit project.
- **High contrast.** A decorative section edge drew a white band in Windows forced-colours mode; it is now hidden there, with a regression test.
- **Cleanup.** Three dead modules, an unused port, four unused exports, and orphaned CSS were removed. Stray build output, reports, and `.DS_Store` files were deleted.

## Phase 10 review

Phase 10 was reviewed against its acceptance criteria and code before this phase started. It is accepted.

| Finding | Severity | Disposition |
| --- | --- | --- |
| No CSP or security headers, although `security.md` required them | High (release gate) | Fixed in Phase 11 (see Security) |
| Room JSON-LD used `maximumAttendeeCapacity` (an event-venue property) | Low | Replaced with schema.org `occupancy`; unit test updated |
| `npm run lighthouse` fails without a system Chrome install | Low | Documented `CHROME_PATH` using Playwright's Chromium in `testing.md` |
| Dead code from Phases 2–4 (`publication.ts`, `unit-of-work.ts`, `destination-placeholder.tsx`) | Low | Removed |
| Metadata, canonicals, sitemap, robots, redirects, cache tags, content audit | — | Verified correct; no change |

## Test totals

All commands were run on the final tree against local PostgreSQL 18.4 (Postgres.app) with disposable `*_test` databases.

| Suite | Command | Result |
| --- | --- | --- |
| Format, lint, typecheck, unit/component, build | `npm run check` | Pass. 37 files, **524 tests** pass. Build pass; every route is dynamic |
| Integration | `TEST_DATABASE_URL=… npm run test:integration` | 12 files, **155 tests** pass |
| E2E, Chromium (desktop, Pixel 7, visual, promotions) | `E2E_DATABASE_URL=… npm run test:e2e` | **141 passed**, 0 failed, 0 flaky (project-scoped skips as designed) |
| E2E, WebKit (desktop, iPad, iPhone 14) | `CROSS_BROWSER=1 npx playwright test --project=webkit-*` | **94 passed**, 0 failed, 0 flaky (project-scoped skips as designed) |
| E2E, Firefox desktop | `npm run test:e2e:browsers` | **Cannot run on this Mac.** Playwright's Firefox 155 build exits with "Could not find profile folder" on macOS 27, for any profile path, in the agent's shell and in the user's own terminal alike. It needs a Linux CI runner or an older macOS; see [Open items](#open-items-that-need-a-person) |
| Schema drift | `prisma migrate deploy` on a scratch DB, then `prisma migrate diff --from-config-datasource --to-schema` | "No difference detected" |

Skips are intentional viewport scoping (for example, keyboard flows run on desktop and touch targets on phones), not disabled tests. The user's cross-browser run exposed one flaky test. "The header tucks away…" could scroll before the page's script started listening; the script then correctly treated the scrolled position as the start and never tucked the header. The test now waits for `data-enhanced="true"` before scrolling. Under parallel load it then passed 30/30 (15 repeats each in WebKit and Chromium), and a full WebKit rerun passed 91/91. The header itself was not at fault.

New tests this phase: authorization sweep (53), CSP/proxy unit tests (12), enquiry outage/redaction tests (3), aborted-upload integration test (1), security E2E spec (6 tests × 2 Chromium + 3 WebKit projects), and a forced-colours E2E test.

### Coverage

`npm run test:coverage` (V8), lines covered:

| Layer | Unit | Integration |
| --- | ---: | ---: |
| `domain` | 98.4% | 78.2% |
| `application` | 69.2% | 67.3% |
| `infrastructure/db` | 1.7% | 83.0% |
| `infrastructure/media` | 78.8% | 83.6% |
| `infrastructure/auth` | 7.7% | 96.2% |
| `proxy.ts`, `infrastructure/http` | 100% | — |

Every application-layer file is at 75% or more in at least one suite (most are 85–97%). Pages and presentation are exercised by Playwright rather than coverage-counted.

## Security findings

| Area | Check | Result |
| --- | --- | --- |
| Authorization / IDOR | Sweep of 43 commands × signed-out, and the 8 admin-only commands × editor; guard must precede all data access | Pass. Content is single-tenant; the only per-user resources (own sessions, own password) derive the user from the session, never from input |
| CSP | Nonce per response, applied to Next's scripts; zero violations while seven page types hydrate and navigate (Chromium and WebKit); inline handler injection refused and reported; framing refused. The first version of the injection test inserted a script from already-trusted code, which `'strict-dynamic'` allows by design; it was rewritten to use real injected markup | Pass. Lighthouse `csp-xss` audit passes on all templates |
| Headers | `nosniff`, `DENY`, referrer policy, COOP, Permissions-Policy, no `X-Powered-By`; media keeps its sandbox CSP | Pass |
| Cookies | HttpOnly, SameSite=Lax, `/admin` path, host-only; `__Secure-` and Secure in production | Pass (existing integration and E2E tests) |
| Stored/reflected XSS | Rich text, contact, promotion, and settings payloads; JSON-LD `<` escaping | Pass (existing tests); React escaping, no raw HTML |
| Open redirect | External, protocol-relative, `javascript:`, and encoded return paths | Pass (unit + E2E) |
| CSRF / origin | Server Actions use Next's origin check; upload route rejects cross-site `Origin`/`Sec-Fetch-Site` | Pass (unit); signed-in cross-site E2E is impossible over HTTP because the cookie is Secure |
| Rate limits | Login per account and per client; contact per client and global | Pass (integration) |
| Uploads | MIME/extension/magic bytes, SVG, polyglots, oversize stream cut-off, decompression bombs, traversal and symlink escapes | Pass (existing); plus the aborted-stream test |
| Secrets | Scanned `.next/static` for the auth secret, database URL, media root, and env names | None found |
| Logging | `src/` has one log call (the enquiry outage), which records only the error class and code | Pass; unit test asserts no email or message text |
| Dependencies | `npm audit --omit=dev` | **0 production vulnerabilities** |
| Dev dependencies | `npm audit` | 10 advisories (7 high), all inside `@lhci/cli` (`extract-zip`, `tmp`, `uuid` via Lighthouse/puppeteer/inquirer). No upstream fix; accepted as a residual risk (below) |
| Database privileges | Least-privilege runtime role design | Documented SQL in `security.md` for Phase 12 provisioning |
| Migrations | Three additive migrations; no drops, type changes, deletes, or renames | Reviewed; drift check clean |

No critical or high defect remains in shipped code.

## Accessibility findings

| Check | Result |
| --- | --- |
| axe on every public template (Chromium desktop/phone, WebKit desktop/tablet/phone) and admin screens (Chromium) | 0 violations |
| Keyboard: skip link, header, photo viewer focus trap and return, menus, dialogs, forms | Pass in Chromium and WebKit (WebKit uses Option-Tab, matching Safari's macOS default) |
| Reflow: every template at 320–1440 px (320 px ≈ 400% zoom at 1280 px); admin shell at 200% zoom | Pass |
| Reduced motion | Pass (existing tests) |
| Forced colours | **Fixed**: the decorative section edge drew a white band. It is now hidden under `forced-colors: active`, with an E2E regression test. axe's colour-contrast results under emulated forced colours are false positives: axe reads the author colour, while the rendered text is system white on black (see screenshots) |
| Screen reader | Not run: an automated agent cannot drive VoiceOver or NVDA meaningfully. Semantic roles, names, live regions, and dialog labelling are asserted by tests. A manual pass is an open item |

No critical or serious accessibility blocker is known.

Screenshots: `docs/screenshots/phase-11-forced-colors-before.png` and `phase-11-forced-colors-after.png` (room detail, 1280 px, emulated forced colours).

## Browser and device matrix

| Engine / browser | Phone | Tablet | Desktop | Evidence |
| --- | --- | --- | --- | --- |
| Chromium (Chrome) | Pixel 7 ✅ | covered by the 768/1024 px reflow sweep ✅ | 1280/1440 px ✅ | Full suite incl. admin, visual baselines |
| Edge | — | — | Chromium engine; not separately installed | Open item: manual smoke on real Edge |
| WebKit (Safari engine) | iPhone 14 ✅ | iPad gen 7 ✅ | Desktop Safari profile ✅ | Public, shell, security suites |
| Firefox | — | — | Project configured; Playwright Firefox cannot start on macOS 27 | Open item: run in Linux CI, or a manual smoke in real Firefox |
| Real Safari | — | — | — | Open item: manual smoke; Playwright WebKit is the engine, not the shipped browser |

## Failure and reliability

| Scenario | Behaviour | Evidence |
| --- | --- | --- |
| Database down during contact submit | Honest error, typed values kept, no false success, no PII in logs | `tests/unit/public/enquiry-action.test.ts` |
| Database down while rendering a page | Branded error boundary with retry and home link; no stack traces | `src/app/(marketing)/error.tsx`, `src/app/admin/(protected)/error.tsx` |
| Email delivery fails | Enquiry saved and flagged "Delivery failed" | Integration and E2E |
| Storage write fails / disk full | Record marked FAILED, quarantine and objects cleaned | Integration |
| Storage delete fails | Stops serving immediately; cleanup retries removal | Integration |
| Browser aborts upload | Nothing servable; retry works | New integration test |
| Duplicate submits / concurrent edits | Duplicate images refused; stale forms and concurrent saves rejected by version; login failures counted exactly under concurrency | Integration |
| Transaction rollback | Social-link replace rolls back the version bump on failure; reorders and media swaps are atomic | Integration |
| Cache invalidation failure | Tag invalidation runs after a committed write. `revalidateTag` has no I/O failure mode locally; a failure would surface as an error after the save, never as a false success | Accepted (below) |

## Performance regression comparison

Same method as Phase 10: production build, local demo data, one run per template.

| Profile | Route | Phase 10 (P/A/BP/SEO · LCP) | Phase 11 |
| --- | --- | --- | --- |
| Desktop | Home | 99/100/100/100 · 827 ms | 100/100/100/100 · 641 ms |
| Desktop | Rooms | 100/100/100/100 · 645 ms | 100/100/100/100 · 650 ms |
| Desktop | Room detail | 99/100/100/100 · 666 ms | 100/100/100/100 · 648 ms |
| Desktop | Contact | 100/100/100/100 · 625 ms | 100/100/100/100 · 625 ms |
| Mobile | Home | 84/100/100/100 · 3,575 ms | 92/100/100/100 · 3,332 ms |
| Mobile | Rooms | 93/100/100/100 · 3,075 ms | 94/100/100/100 · 3,152 ms |
| Mobile | Room detail | 94/100/100/100 · 3,076 ms | 94/100/100/100 · 3,080 ms |
| Mobile | Contact | 94/100/100/100 · 3,072 ms | 95/100/100/100 · 3,000 ms |

CLS is 0 everywhere and TBT ≤ 10 ms. Script transfer is 208 KiB, within the 260 KB gate. The Phase 10 Home mobile LCP exception did not recur in this run (3.33 s against the 3.5 s budget). Single throttled runs vary by a few hundred milliseconds, so treat that as within noise rather than a proven fix.

## Backup and restore drill

2026-09-26, local non-production environment:

1. `scripts/backup.sh` against the seeded `rivana` database and its media root: a 64 KB dump, a 2.0 MB image archive, 21 file checksums, and a mode-700 directory.
2. Restored into a new `rivana_restore_test` database and a scratch media root: checksums verified first, every `READY` image present, permissions reset to 750/640.
3. Record counts matched the source exactly: 5 rooms, 3 facilities, 3 pages, 21 ready images, 0 enquiries, 2 staff.
4. The production server started against the restored database and media: `/`, `/rooms`, a room detail, `/facilities`, `/contact`, and `/sitemap.xml` returned 200, and restored images were served (`200 image/jpeg`).
5. Safety checks: a second restore into the non-empty target was refused, and a tampered dump failed checksum verification before anything was touched.
6. The scratch database and media were deleted afterwards.

Restore time was under one second at this data size. Phase 12 must repeat the drill with the production-sized dataset and the real off-server copy.

## Files

**Added**

- `src/infrastructure/http/security-headers.ts`: CSP builder, nonce, static headers
- `scripts/backup.sh`, `scripts/restore.sh`
- `tests/unit/auth/authorization-sweep.test.ts`, `tests/unit/security/security-headers.test.ts`, `tests/unit/public/enquiry-action.test.ts`, `tests/e2e/security.spec.ts`
- `docs/phase-11-release-candidate.md`, `docs/screenshots/phase-11-forced-colors-{before,after}.png`

**Changed**

- `src/proxy.ts`: runs on all rendered pages; nonce CSP; admin redirect and headers unchanged in behaviour
- `next.config.ts`: static security headers
- `src/app/not-found.tsx`: rendered per request so its scripts carry the nonce
- `src/app/(marketing)/actions.ts`: outage handling and redacted logging
- `src/app/globals.css`: forced-colours rule; photo viewer layout; removed orphaned `.admin-facts`
- `src/presentation/site/site-image.tsx`, `src/presentation/site/gallery.tsx`: `fit` option; the viewer uses `contain`
- `src/application/public/seo.ts`: `occupancy`
- `src/application/ports/repositories.ts`, `src/composition/media.ts`, `src/domain/media/media-asset.ts`, `src/domain/shared/domain-error.ts`: removed unused code
- `playwright.config.ts`: opt-in Firefox/WebKit projects
- `vitest.config.ts`, `vitest.integration.config.ts`: V8 coverage
- `package.json` / lock: `test:e2e:browsers`, `test:coverage`, `@vitest/coverage-v8@5.0.2` (dev)
- `.prettierignore`: ignore `.claude/` and `.lighthouseci/`
- `tests/e2e/public-site.spec.ts`: forced-colours test; photo-viewer fit test; Option-Tab in WebKit; header test waits for hydration
- `tests/integration/media.test.ts`: aborted upload
- `tests/unit/public/seo.test.ts`
- Docs: `roadmap.md`, `README.md`, `security.md`, `testing.md`, `deployment.md`, `domain-model.md`, `phase-10-seo-performance.md`

**Removed**

- `src/application/content/publication.ts`, `src/infrastructure/db/prisma/unit-of-work.ts`, `src/presentation/admin/destination-placeholder.tsx`
- Untracked clutter: `test-results/`, `.lighthouseci/`, `tsconfig.tsbuildinfo`, `.DS_Store` files

## Decisions and assumptions

- **Nonce CSP, not SRI.** Every public page was already dynamic, so a nonce costs nothing and gives the strictest script policy. SRI is experimental in Next 16.
- **`style-src 'unsafe-inline'`.** React SSR and `next/image` emit `style` attributes, which cannot execute script. Style nonces would block them.
- **HSTS deferred to Phase 12.** Sending it before the final HTTPS domain is proven risks locking users out.
- **Cross-browser projects are opt-in** (`CROSS_BROWSER=1`), so the everyday suite stays fast and does not need extra browser downloads.
- **Admin journeys stay on Chromium.** Production cookies are Secure, and WebKit drops Secure cookies on plain-HTTP `127.0.0.1`. Phase 12 smoke tests run admin flows over real HTTPS.

## Migrations, configuration, environment

- No database migrations.
- No new environment variables. `APP_URL`'s scheme now also decides `upgrade-insecure-requests`.
- New dev dependency: `@vitest/coverage-v8@5.0.2` (matches Vitest 5.0.2).
- Local only: Playwright Firefox and WebKit engines installed with `npx playwright install firefox webkit`.

## Residual risks

| Risk | Severity | Owner | Decision |
| --- | --- | --- | --- |
| Dev-only advisories in `@lhci/cli` (`extract-zip`, `tmp`, `uuid`) | High (dev) / none in production | Developer | **Accept.** The tool runs locally against our own URLs, is never deployed, and has no upstream fix. Revisit when Lighthouse CI updates |
| Firefox suite not executed (Playwright Firefox is incompatible with macOS 27) | Medium | Developer / reviewer | **Defer to review.** A manual smoke in real Firefox now; automated Firefox in Linux CI in Phase 12 |
| No real-Safari, real-Edge, or screen-reader pass | Medium | Client QA / developer | **Defer to review.** Engines are covered; a 15-minute manual smoke per browser and a VoiceOver pass are required before launch |
| `'strict-dynamic'` trusts scripts created by already-trusted code | Low | Developer | **Accept.** This is standard strict CSP; injected markup is blocked, and there is no third-party script |
| Cache invalidation throws after a committed save | Low | Developer | **Accept.** Theoretical locally; it could only cause a false *failure* message, never a false success |
| Single Lighthouse run per template | Low | Developer | **Accept.** It is a regression signal; field Web Vitals come after launch (Phase 12) |
| Phase 10 launch blockers (HTTPS host, official contacts, SEO defaults, privacy/rights wording, SMTP, one legacy redirect) | High (launch) | Client | **Blocks launch**, not the release candidate. `npm run audit:content` still exits 2 on demo data |

## Open items that need a person

1. Firefox: a manual smoke in real Firefox, or the `firefox-desktop` project on a Linux CI runner. Playwright's Firefox does not start on macOS 27. Locally, run the WebKit projects with `CROSS_BROWSER=1 npx playwright test --project=webkit-desktop --project=webkit-tablet --project=webkit-phone`.
2. Manual smoke on real Safari (macOS and iOS) and Edge: home, a room with the photo viewer, the menu, and the contact form.
3. A VoiceOver pass: navigation, room facts, photo viewer, contact form errors and success, and the Book Now explanation.

## Acceptance checklist

| Criterion | Evidence |
| --- | --- |
| Critical flows pass reliably in CI and a production-like environment | Production build; Chromium 141/141 and WebKit 94/94 runnable tests pass; the one flaky test found was fixed and stress-tested 30/30; Firefox pending (open item 1) |
| No known critical/high security defect remains | Security table; CSP added; 0 production advisories; dev-only advisories accepted |
| No critical/serious accessibility blocker remains | axe clean on all templates and engines; forced-colours defect fixed; screen-reader pass pending (open item 3) |
| Failure paths do not lose data or claim false success | Failure table; new outage and aborted-upload tests |
| Release build is reproducible and migrations are reviewed | `npm run check` passes; lockfile pinned; drift check clean; migrations additive |
| Residual risks have owner, severity, and decision | Residual-risk table |

Phase 12 has **not** started.
