# ADR 010 — Tailwind, semantic tokens, and selective shadcn/ui

Status: Accepted for Phase 1

## Context

Rivana needs a centralized bespoke luxury identity plus accessible, efficient admin controls. The reference CSS has valuable tokens but also scattered page-specific values and inconsistent treatments.

## Decision

Use Tailwind CSS 4.3 with CSS custom properties as semantic design tokens. Use selected shadcn/ui source components for accessible admin/primitives, restyled through Rivana tokens. Build public editorial components specifically for the brand.

## Reasoning

Tailwind provides consistent utility composition and responsive states without runtime CSS. CSS variables preserve a readable theme contract. shadcn supplies inspectable source rather than a locked visual package.

## Alternatives considered

- **Copy reference CSS:** carries study-specific duplication and accessibility issues.
- **CSS Modules only:** viable, but slower consistency enforcement for the selected component workflow.
- **Full component library:** quick admin UI but makes bespoke public design harder and adds visual/runtime weight.
- **CSS-in-JS runtime:** unnecessary client/runtime overhead.

## Consequences

Token discipline and component variants must be enforced in review. shadcn components are owned source and require maintenance. Public pages will not look like a default component kit. Arbitrary values require justification.
