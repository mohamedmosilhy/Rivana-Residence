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

## Planned additions (ADR 015)

```text
src/
  app/
    (marketing)/book/                     branch selection, search/results, details & review   (M8)
    (marketing)/reservations/manage/      guest manage page (token from fragment)              (M8)
    (marketing)/reservations/find/        "send me my link"                                    (M8)
    admin/(protected)/reservations/       list, new, [id]                                      (M9)
    admin/(protected)/availability/       grid                                                 (M9)
    admin/(protected)/inventory/          physical rooms, blocks                               (M9)
    admin/(protected)/pricing/            rates & periods                                      (M10)
    admin/(protected)/reports/            statistics                                           (M10)
    admin/(protected)/branches/           branch admin                                         (M10)
    admin/(protected)/guests/             guest profiles, blocking                             (M9)
    admin/(protected)/audit/              audit log                                            (M10)
    api/v1/
      _http/                              route wrappers, problem mapping, CSRF, request ids    (M4)
      branches/…, reservations/…, phone-verifications/…, guest/reservation(s)/…           (M5–M7)
      staff/…                                                                                  (M5–M7)
  contracts/api/v1/                       Zod DTOs shared by handlers, client, OpenAPI         (M4+)
  domain/
    shared/  + local-date.ts, stay-range.ts, money.ts                                          (M6)
    branches/, inventory/, pricing/, reservations/, guests/, audit/                               (M4–M7)
  application/
    branches/, inventory/, pricing/, reservations/, guests/, reporting/, audit/, notifications/        (M4–M10)
    ports/   + reservation ports (UnitOfWork, locks, readers, outbox, tokens)
  infrastructure/
    db/prisma/repositories/{branches,inventory,pricing,reservations,reporting,audit}/
    db/prisma/unit-of-work.ts
    email/ + reservation-email-sender.ts, outbox-dispatcher.ts
    whatsapp/ whatsapp-sender.ts (provider adapter: verification codes, booking messages)
    crypto/ secure-token-generator.ts
  composition/  + branches.ts, reservations.ts, reporting.ts
  presentation/
    features/booking/                    booking journey components                           (M8)
    admin/reservations/, admin/inventory/, admin/pricing/, admin/reports/                     (M9–M10)
    api-client/                          typed fetch wrappers over src/contracts              (M4)
scripts/  + openapi.mts, reservations.mts (outbox, expire-tokens)
tests/
  unit/domain/reservations/…, unit/architecture/ (+ new boundary tests)
  integration/reservations/ (repositories, use cases, route handlers, concurrency.test.ts)
  e2e/booking.spec.ts, e2e/reception.spec.ts, e2e/management.spec.ts
docs/api/openapi.json                    generated
```

## Why this shape

- It keeps one convention (layer first, module second) so existing lint rules and tests keep working (ADR 015).
- Staff reservation screens live in the existing `/admin` shell: one sign-in, a capability-filtered navigation already exists (`src/presentation/admin/navigation.ts`), and the proxy and admin headers already cover `/admin`.
- `src/contracts` is a new top-level folder because both server handlers and client code need the same schemas, and neither `application` (server logic) nor `presentation` (UI) is the right owner.
- The booking journey lives under `(marketing)` to inherit the site header, footer, fonts, and CSP. Its route segment is `/book`, so it does not collide with `/rooms/[slug]`.
- No `src/shared` or `src/utils` dumping ground is created.
