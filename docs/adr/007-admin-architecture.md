# ADR 007 — Admin inside the Next.js application

Status: Accepted for Phase 1

## Context

The admin and public site share content, auth boundaries, media workflows, design tokens, and a small team. No independent deployment/release organization exists.

## Decision

Build `/admin` as a protected route group in the same Next.js application, with distinct layouts/components and shared application use cases.

## Reasoning

One app avoids duplicated schemas, SDKs, auth, validation, and deployments. Route groups and internal layers provide sufficient separation. The admin can still have a task-oriented design distinct from public editorial pages.

## Alternatives considered

- **Separate Next.js admin:** deploy/release isolation, but duplicates too much for current scale.
- **Off-the-shelf headless CMS:** faster generic editing but mismatched bounded workflows and another service/data model.
- **Prisma Studio:** developer tool, not safe/usable client CMS.

## Consequences

Public and admin failures share a deployment, so tests and route isolation matter. Admin routes are dynamic/noindex and protected close to data. A later split remains possible because use cases and ports do not live in route files.
