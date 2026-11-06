# Project structure

## Today (verified 2026-10-24)

```text
src/
  app/
    (marketing)/            public pages: /, about, rooms, rooms/[slug], facilities, facilities/[slug], contact
    admin/login/            staff sign-in
    admin/(protected)/      CMS: pages, rooms, facilities, media (+ upload route.ts), promotions, enquiries, settings, staff, account
    media/[...key]/route.ts public media delivery
    layout.tsx, sitemap.ts, robots.ts, not-found.tsx, globals.css
  domain/                   auth, content, enquiries, facilities, media, promotions, rooms, settings, shared
  application/              admin, auth, booking, cache, content, enquiries, media, ports, promotions, public, settings, shared
  infrastructure/           auth, booking, cache, db/prisma (client, repositories, mappers), email, http, ids, media, server
  composition/              admin, auth, content, media, public   (the only place infrastructure is constructed)
  presentation/             admin/*, design/*, features/promotions, site/* (incl. motion/)
  lib/env/                  Zod-validated environment
  generated/prisma/         generated client (git-ignored)
  proxy.ts                  CSP nonce + optimistic admin redirect (Next 16 "proxy", formerly middleware)
prisma/                     schema.prisma, migrations/, seeds, initial-content/
tests/                      unit/, integration/, e2e/, support/
scripts/                    staff CLI, media CLI, backup/restore, seeds, content audit, contrast report
design/                     reference HTML/CSS and design specs (source of truth for visuals)
docs/                       this documentation
.claude/skills, .agents/skills   JavaScript Mastery agent skills (Claude Code / Codex)
```

## Planned additions (ADR 015, ADR 026; milestones from the 2026-11-06 replan)

```text
src/
  app/
    (marketing)/page.tsx                  branch chooser or redirect to the only branch         (M5)
    (marketing)/[branch]/                 home, about, stay/[slug], facilities/[slug], contact (M5)
    (marketing)/[branch]/book/            search/results, details & review, confirmed, payment  (M10)
    (marketing)/reservations/manage/      guest manage page (token from fragment)              (M10)
    (marketing)/reservations/find/        "My reservations" (phone + code)                     (M10)
    admin/(protected)/reservations/       list, new, [id]                                      (M11)
    admin/(protected)/cancellations/      cancellation requests, refunds                       (M11)
    admin/(protected)/availability/       grid                                                 (M11)
    admin/(protected)/inventory/          units, blocks                                        (M11)
    admin/(protected)/guests/             guest profiles, blocking                             (M11)
    admin/(protected)/pricing/            rates & date periods                                 (M12)
    admin/(protected)/services/           breakfast, airport transfer                          (M12)
    admin/(protected)/coupons/            coupon codes                                         (M12)
    admin/(protected)/reports/            statistics                                           (M12)
    admin/(protected)/branches/           branch admin (minimal M5)                            (M5, M12)
    admin/(protected)/audit/              audit log                                            (M12)
    admin/(protected)/broadcasts/         WhatsApp offers                                      (M13)
    api/v1/
      _http/                              route wrappers (public, staff, webhook), problem mapping, CSRF, request ids (M4)
      branches/…, quotes, reservations/…, phone-verifications/…, guest/reservation(s)/…    (M5–M9)
      payments/paymob/callback/           Paymob webhook (HMAC)                                (M9)
      staff/…                                                                                  (M5–M13)
  contracts/api/v1/                       Zod DTOs shared by handlers, client, OpenAPI         (M4+)
  domain/
    shared/  + local-date.ts, stay-range.ts, money.ts, rounding.ts                             (M6–M7)
    branches/, inventory/, pricing/, coupons/, services/, reservations/, payments/, guests/, marketing/, audit/   (M4–M13)
  application/
    branches/, inventory/, pricing/, coupons/, services/, reservations/, payments/, guests/, reporting/, marketing/, audit/, notifications/   (M4–M13)
    ports/   + reservation ports (UnitOfWork, locks, readers, outbox, tokens, PaymentGateway)
  infrastructure/
    db/prisma/repositories/{branches,inventory,pricing,coupons,reservations,payments,guests,reporting,marketing,audit}/
    db/prisma/unit-of-work.ts
    email/ + reservation-email-sender.ts, outbox-dispatcher.ts
    whatsapp/ whatsapp-sender.ts (provider adapter: authentication, transactional, feedback, marketing templates)
    payments/paymob/ paymob-gateway.ts (hosted checkout, HMAC verification, refunds; server-only)
    crypto/ secure-token-generator.ts
  composition/  + branches.ts, reservations.ts, payments.ts, reporting.ts, marketing.ts
  presentation/
    features/branches/                   chooser, switcher, branch-aware links                 (M5)
    features/booking/                    booking journey components                           (M10)
    admin/{reservations,cancellations,inventory,guests,sync}/                                  (M11)
    admin/{pricing,services,coupons,reports,branches,audit}/                                   (M12)
    admin/broadcasts/                                                                          (M13)
    api-client/                          typed fetch wrappers over src/contracts              (M4)
scripts/  + openapi.mts, reservations.mts (outbox, expire-holds, reconcile-payments, expire-tokens)
tests/
  unit/domain/{reservations,pricing,coupons,payments}/…, unit/architecture/ (+ new boundary tests)
  integration/reservations/ (repositories, use cases, route handlers, concurrency.test.ts)
  integration/payments/ (fake gateway, callbacks, refunds)
  e2e/branches.spec.ts, e2e/booking.spec.ts, e2e/reception.spec.ts, e2e/management.spec.ts
docs/api/openapi.json                    generated
```

## Why this shape

- It keeps one convention (layer first, module second) so existing lint rules and tests keep working (ADR 015).
- Staff reservation screens live in the existing `/admin` shell: one sign-in, a capability-filtered navigation already exists (`src/presentation/admin/navigation.ts`), and the proxy and admin headers already cover `/admin`.
- `src/contracts` is a new top-level folder because both server handlers and client code need the same schemas, and neither `application` (server logic) nor `presentation` (UI) is the right owner.
- Branch pages and the booking journey live under `(marketing)/[branch]` to inherit the site header, footer, fonts, and CSP. Branch slugs are validated against reserved top-level segments (ADR 026). The booking journey is `/{branch}/book`.
- No `src/shared` or `src/utils` dumping ground is created.
