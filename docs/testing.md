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

## Accessibility and visual QA

- axe checks on representative public/admin routes;
- keyboard-only manual pass for header/menu/gallery/forms/dialogs/uploader;
- screen-reader smoke test for navigation, form errors, and booking disabled state;
- contrast and 200% zoom/reflow checks;
- reduced-motion tests;
- screenshot comparisons for selected stable compositions at 390, 768, 1280, and 1440px.

Visual snapshots cover major page templates and high-risk interactions, not every pixel of dynamic imagery.

## Performance and SEO tests

- Lighthouse CI budgets on Home, rooms listing, and a detail page;
- assert image dimensions/sizes and no obvious below-fold priority misuse;
- metadata/canonical/robots/sitemap tests;
- validate JSON-LD shape and absence of invented offers/prices/ratings;
- bundle analysis before release.

## Security tests

- authorization matrix for all commands;
- CSRF/origin and method behavior on route handlers;
- stored-XSS payloads in rich text/contact fields;
- upload MIME/extension/magic-byte/size/dimension mismatches;
- media IDOR/reference deletion;
- local path traversal, encoded separators, symlink escape, executable upload, and direct access to quarantined/non-ready files;
- promotion stored-XSS, invalid schedule, unauthorized publish, and client-clock bypass attempts;
- open redirect and unsafe return-path cases;
- login/contact rate limiting;
- secrets absent from client bundle and logs.

## CI gates

Pull requests run format/lint, TypeScript, unit/component tests, integration migrations/tests, production build, and a focused Playwright smoke suite. Main/release runs the full E2E, accessibility, and performance suite. Database migrations receive explicit review and a production backup/rollback note.
