# ADR 005 — S3-compatible media storage abstraction

Status: Accepted for Phase 1

## Context

The site is image-heavy and editors need uploads/replacements/deletion. PostgreSQL must not store binaries, and the implementation should survive a future storage-provider change.

## Decision

Store image objects in S3-compatible object storage/CDN and metadata in `MediaAsset`. Access the provider through `MediaStorage`. Use direct signed uploads, immutable object keys, and a local filesystem or local S3-compatible development adapter.

## Reasoning

The S3 protocol is widely supported and direct uploads avoid routing large files through application functions. The port isolates endpoint/bucket/signing details. Relational metadata enables alt text, focal points, usage checks, and safe deletion.

## Alternatives considered

- **PostgreSQL blobs:** poor database size/performance/backup characteristics.
- **Repository/public directory:** requires redeploys and cannot support editor uploads safely.
- **Vercel Blob directly in components:** practical but unnecessarily leaks a deployment vendor.
- **Cloudinary-specific content model:** rich transforms, but creates stronger provider coupling and cost before requirements justify it.

## Consequences

Upload finalization is eventually consistent with the database and needs pending/failed cleanup. CORS, signed URL expiry, object headers, and image-origin allowlists must be configured. Provider replacement is an adapter/data-migration task, not a page rewrite.
