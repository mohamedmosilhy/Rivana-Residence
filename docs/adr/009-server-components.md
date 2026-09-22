# ADR 009 — Server Components by default

Status: Accepted for Phase 1

## Context

Marketing pages are read-heavy, SEO-sensitive, and image-heavy. The admin has isolated interactive forms/uploads. A client-rendered application would ship unnecessary JavaScript and expose more data-fetching surface.

## Decision

Render route composition and primary content as React Server Components. Use Client Components only for browser interaction: navigation, galleries, dialogs, complex forms, uploads, and progressive motion. Use Server Actions for same-origin mutations and Route Handlers for real HTTP/integration boundaries.

## Reasoning

Server-first output improves initial HTML, SEO, bundle size, secret isolation, and direct application-query access. Small client islands retain rich interaction where needed.

## Alternatives considered

- **All Client Components:** familiar SPA model, but worse JS/performance and needless APIs.
- **Static export:** fast, but incompatible with integrated authenticated CMS and dynamic publishing needs.
- **API route for every query:** adds internal network/serialization layers without benefit.

## Consequences

Props crossing client boundaries must be serializable DTOs. Developers must avoid importing server modules into client trees. Mutation authorization remains inside each Server Action/use case, not assumed from rendering.
