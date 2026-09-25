# ADR 005 — Persistent local media storage behind `MediaStorage`

Status: Accepted for Phase 1

## Context

The site is image-heavy and editors need uploads, replacements, and deletion. Production will run as one application instance on the client's Hosting.com/cPanel account, which can provide a persistent writable directory. The client prefers to use storage already included with hosting rather than purchase a separate object-storage service.

PostgreSQL must not store image binaries, deployments must not erase uploads, and the implementation should survive a future move to object storage or another host.

## Decision

Store production image files in a configured persistent directory on the Hosting.com server, outside the Git checkout and application release/build directories. Store only provider-neutral metadata and a server-generated relative `storageKey` in `MediaAsset`; never store an absolute server path in PostgreSQL.

Access files only through the `MediaStorage` port. The local adapter writes immutable keys, finalizes uploads atomically where the filesystem permits, opens/deletes files, and resolves a controlled public `/media/...` URL. A route handler or reviewed web-server alias serves that URL with correct content type, cache, range, and `nosniff` headers. The storage root comes from server-only configuration and cannot be changed in the admin UI.

Use a temporary/quarantine directory for upload validation, then move a verified file into the final media root. Development and tests use separate temporary roots. Keep the contract compatible with a later S3-compatible adapter.

## Reasoning

For a single persistent cPanel deployment and the expected small editorial team, local media is the simplest and lowest incremental-cost option. It avoids a separate storage account and credentials while still letting administrators upload without a code deployment. Keeping `MediaStorage` prevents filesystem assumptions from leaking into domain, database, or UI code.

## Alternatives considered

- **S3-compatible object storage/CDN:** better for multiple application instances and independent durability, but adds another service and possible cost before scale requires it.
- **PostgreSQL blobs:** poor database size/performance/backup characteristics.
- **Repository or build `public/` directory:** rejected because deployments can overwrite it and uploaded binaries do not belong in Git.
- **Cloudinary-specific content model:** rich transforms, but creates stronger provider coupling and cost before requirements justify it.

## Preconditions

Before production implementation, verify on the actual cPanel account:

- the Next.js application runs as a persistent Node process supported by the plan;
- the chosen directory is writable by only the application account and survives deployments/restarts;
- available disk/inode quota is sufficient and can be monitored;
- the directory is included in a documented backup/restore process;
- the web server can safely expose `/media/` or proxy it to the application;
- staging/preview cannot write to the production media root.

If any precondition fails, use an S3-compatible adapter without changing domain or presentation code.

## Consequences

Media uses capacity already included in the hosting plan, but it is not literally costless: it consumes the paid plan's disk, inode, transfer, and backup allowances. The server is a storage single point of failure, so off-server backups and restore tests are mandatory. Horizontal multi-server deployment is not supported by the local adapter. Moving hosts requires copying the media directory while preserving keys/checksums, or migrating to object storage.
