# ADR 011 — Managed deployment with portable services

Status: Accepted for Phase 1

## Context

The client needs reliable deployment, previews, CDN/image behavior, database backups, and simple operations. The architecture should not become inseparable from one hosting provider.

## Decision

Initially deploy the Next.js app on Vercel, use managed PostgreSQL, S3-compatible object storage/CDN, and a transactional email provider. Keep database/storage/email/cache integrations behind infrastructure modules and retain Node container deployability.

## Reasoning

Vercel offers the lowest-friction supported Next.js path and preview workflow. Managed stateful services reduce operational burden. Provider-neutral ports, standard PostgreSQL, and S3-compatible storage preserve realistic portability.

## Alternatives considered

- **Single self-hosted VPS:** lower vendor count/cost, but adds patching, scaling, backups, TLS, and process management.
- **Container platform:** portable and viable, but more setup before traffic/requirements justify it.
- **All-Vercel proprietary services:** simplest integration but stronger coupling than necessary.
- **Kubernetes/microservices:** disproportionate complexity.

## Consequences

There are several managed-service credentials and preview isolation requirements. Runtime limits must suit upload signing and server work. Database migrations are a separate controlled job. Moving hosts may require image/cache adapter work, not domain/page redesign.
