# ADR 011 — Hosting.com/cPanel deployment with portable adapters

Status: Accepted for Phase 1

## Context

The client already has a Hosting.com/cPanel account and SSH access. The project should use that existing hosting where its Node, PostgreSQL, persistent-storage, process-management, and backup capabilities pass a production preflight. The architecture should not become inseparable from cPanel or one hosting provider.

## Decision

Initially deploy the Next.js app as a Node production process on Hosting.com/cPanel, use the approved PostgreSQL service, store media in a persistent local directory, and use a transactional email provider. Deploy through SSH with a documented release directory/current-symlink or equivalent recoverable process supported by the account. Keep database/storage/email/cache integrations behind infrastructure modules and retain standard Node/container deployability.

## Reasoning

Using the existing hosting reduces incremental vendor cost and centralizes operations for the client. Provider-neutral ports, standard PostgreSQL, relative media keys, and ordinary Node runtime behavior preserve realistic portability.

## Alternatives considered

- **Vercel plus managed object storage:** low-friction Next.js deployment, but adds services and cost the client does not currently want.
- **Separate VPS:** greater control, but duplicates an existing hosting purchase and adds patching, backups, TLS, and process management.
- **Container platform:** portable and viable, but more setup before traffic/requirements justify it.
- **Kubernetes/microservices:** disproportionate complexity.

## Consequences

The exact cPanel plan must be verified before implementation: supported Node version/process lifecycle, SSH deployment, reverse proxy/domain mapping, PostgreSQL connectivity, environment variables, writable persistent paths, quotas, cron, TLS, logs, and backup/restore. Database migrations remain a separate controlled job. Local media prevents horizontal scaling and requires off-server backups. Moving hosts may require media/cache adapter work, not domain/page redesign.
