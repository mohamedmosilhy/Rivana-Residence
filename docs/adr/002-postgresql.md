# ADR 002 — PostgreSQL

Status: Accepted for Phase 1

## Context

Content has real relationships: rooms/features/media, facilities/media, ordered page sections, users/sessions, settings/social links, and enquiries. Publication and safe deletion need transactions and constraints.

## Decision

Use managed PostgreSQL 18.6 where the selected provider supports it, with supported 17.11 as the fallback, verified with Prisma 7 at provisioning time.

## Reasoning

PostgreSQL supplies relational integrity, transactions, indexes, mature backups, portable hosting, JSONB for bounded section payloads, and enough search/query capability for this CMS without another datastore.

## Alternatives considered

- **SQLite:** excellent locally but a poorer fit for concurrent production CMS/serverless access and managed recovery.
- **MySQL:** viable, but PostgreSQL JSON/constraint/tooling fit is stronger for the proposed model.
- **Document database:** section JSON alone does not outweigh the model's relational integrity needs.
- **Hosted CMS datastore:** adds vendor coupling and a second content model.

## Consequences

Production requires pooling, migrations, backups, and restore drills. JSON is restricted to typed rich text/section payloads; relational data is not collapsed into blobs.
