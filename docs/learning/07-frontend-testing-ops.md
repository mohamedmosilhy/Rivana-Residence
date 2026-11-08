# 7. Frontend, testing, operations, workflow

## Frontend
- Public pages live at `/{branch}/...` (home, about, stay, stay/[slug], facilities, contact). `/` is a branch chooser (2+ active branches), redirects for one, holding page for none. Old URLs and `*.html` redirect permanently to `new-cairo`. Branch slugs cannot be `admin, api, media, reservations, book, ...`.
- Planned M10: `/{branch}/book`, `/book/details`, `/book/confirmed`, `/book/payment`, `/reservations/manage`, `/reservations/find`.
- Staff `/admin/...`: nav shows only permitted destinations; each page re-checks the capability. Built: login, overview, pages, rooms, facilities, media, enquiries, settings, staff, account, branches. Planned: M11 reservations/availability/inventory/guests/cancellations; M12 pricing/reports/audit/services/coupons; M13 broadcasts. Sync reminder is part of the shell.
- Components: Server Components by default, small client islands; components take view models; `ui/` primitives know no hotel concepts; `design/` uses semantic variants; admin dialogs on native `<dialog>`; Tailwind tokens, plum and gold identity.

## Testing
Unit/component (Vitest, jsdom); integration (Vitest on **real PostgreSQL**; drops/recreates any DB ending `_test`); E2E (Playwright + axe, Chromium); Lighthouse budgets.
Gates per task: always format, lint, typecheck, `npm run test`; + integration for domain/application/repo/DB/API; + drift check for migrations; + concurrency suite x20 for locking/inventory; + build and E2E for routes/pages. `npm run check` = format, lint, typecheck, unit, build (no integration/E2E). Baseline counts in quality-gates.md are old (Oct 2026); do not treat as current.

## Operations
Hostinger VPS (planned, not provisioned): Nginx -> one Node process under systemd -> PostgreSQL 18, local media directory. Deploy: CI gates, build, `migrate deploy` once, upload to `releases/<id>`, smoke checks, swap `current` symlink, keep old releases. Nightly DB + media backups off-server. Planned cron: outbox (M8), expire holds and reconcile payments (M9), expire tokens. Cache gotcha: after any out-of-band DB change delete `.next/cache/fetch-cache` and restart. Four environments with separate DB and media. 18 known limitations (L-1 no PMS integration, L-1a confirmation unchecked against PMS, L-7a request-only cancellation, USD only, one VAT rate, WhatsApp-only verification, single server, indefinite data retention).

## Task workflow (how the owner drives)
1. Plan the task card (objective, scope, files, acceptance, tests, risk tier) - **owner approves**.
2. Design if contract/schema/port changes - **owner approves**.
3. Implement only the approved task.
4. Verify: gates for the risk tier.
5. Independent review on a different model (`/check review uncommitted`).
6. Review package (critical paths with `file:line`, edge-case table) - **owner accepts**.
7. Sync docs, task status, commit.
Risk tiers: Critical (auth, branch scope, locks, inventory, prices, VAT, coupons, payments, personal data, tokens) gets deepest review; Medium (repos, handlers, contracts).

Read: `docs/engineering/agent-workflow.md`.
