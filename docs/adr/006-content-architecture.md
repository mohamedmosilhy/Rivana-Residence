# ADR 006 — Typed sections plus structured entities

Status: Accepted for Phase 1

## Context

Editors need meaningful page control, but a generic page builder would expand validation, preview, migration, accessibility, and design-system complexity. Rooms and facilities have stable reusable fields.

## Decision

Model Rooms, Facilities, Settings, Social Links, and Media relationally. Model Home/About/Contact using an allowlisted `PageSection` registry with type-specific versioned Zod payloads and relational media associations.

## Reasoning

This preserves layout ownership in code while allowing copy, media, visibility, and constrained ordering changes. Dynamic grids query canonical room/facility records instead of duplicating them in JSON.

## Alternatives considered

- **Hardcoded pages:** simplest code, but fails client content-management goals.
- **Fully generic blocks/page builder:** maximum flexibility, disproportionate complexity and design drift.
- **One table per page section:** strongest SQL typing, but migration/table overhead for small editorial variations.
- **Raw rich HTML:** unsafe and visually unconstrained.

## Consequences

Each new section type needs schema, editor, renderer, tests, and payload migration. Editors cannot invent arbitrary layouts. JSON validation is an application obligation, while media references retain database integrity.
