# ADR 001 — Next.js App Router

Status: Accepted for Phase 1

## Context

Rivana needs SEO-friendly marketing pages, authenticated CMS screens, server mutations, optimized images, and a future third-party booking boundary. A split SPA/API would duplicate contracts and add operations without a current scaling need.

## Decision

Use Next.js 16.3 Active LTS with the App Router as a TypeScript modular monolith. Use React 19.2 and Node.js 22 LTS, pinning current compatible patches in Phase 1.

## Reasoning

App Router provides Server Components, server rendering, metadata/sitemap primitives, image/font optimization, route handlers, server actions, layouts, and code splitting in one supported framework. It suits content-heavy routes and keeps the CMS near its use cases.

## Alternatives considered

- **WordPress rebuild:** familiar CMS, but repeats the legacy plugin/theme coupling and weak typed boundaries.
- **Headless CMS plus Next.js:** strong editing, but adds vendor/service cost and duplicates a simple bounded content model.
- **React SPA plus separate API:** unnecessary client JavaScript and two deployments/contracts.
- **Separate frontend/admin apps:** duplicates auth, design primitives, and deployment for a small team.

## Consequences

The team must understand server/client boundaries and Next.js caching. Framework upgrades require attention to LTS/security releases. Business logic remains outside route components so a future delivery layer change is possible.
