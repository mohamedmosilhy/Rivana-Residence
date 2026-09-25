# Hosting.com/cPanel preflight

Checked read-only over the existing SSH connection on 2026-09-25. Hostnames, usernames, keys, and absolute account paths are intentionally omitted.

## Confirmed

- SSH access works with the dedicated Rivana deployment key.
- CloudLinux Node Selector is enabled with Passenger active.
- Node.js `22.23.2` is available for an application even though the login shell defaults to obsolete Node `10.24.0`; deployment commands must enter the Node 22 selector environment explicitly.
- `rsync` and user cron are available.
- Docker and Podman are not installed for this shared account; rootless container execution is not an approved deployment path.
- The account reports no fixed megabyte quota through cPanel and is under its quota; about 4 GB is currently used.
- The inode allowance is 600,000 with about 70,250 currently used.
- A local PostgreSQL service responds and cPanel exposes PostgreSQL management, but no database is currently allocated to this account.

## Blockers and decisions before deployment

- The installed PostgreSQL client is `10.23`, an end-of-life major version and below the project's supported baseline. Do not use it for production unless Hosting.com can provision a currently supported PostgreSQL version. The default plan is therefore an external managed PostgreSQL 17+ database while keeping the app and media on cPanel.
- Configure the application with Node 22 in CloudLinux/Passenger; never rely on the login shell's default `node` binary.
- Choose and provision a persistent media root outside both `public_html` and every versioned application release. Serve it through the application `/media/` route unless a reviewed non-executable web-server alias is available.
- Confirm domain-to-application mapping, environment-secret entry, restart command, process limits, request-body/time limits, and log locations in the cPanel Node application UI.
- Configure an off-server database and media backup, then prove a restore before launch.
- Add a free-space alert. The underlying shared filesystem reported high aggregate utilization during the check; cPanel reports the user account itself under quota, but provider-level capacity remains outside application control.

## Deployment readiness

The account is suitable in principle for the Next.js application and local media storage. Production deployment remains blocked until the supported PostgreSQL connection, cPanel Node application configuration, persistent media root, backup target, and domain mapping are provisioned and tested.

## Staging environment

- cPanel subdomain `staging.rivanaresidence.com` was created on 2026-09-25 with an isolated document root.
- The current static reference build was deployed there temporarily so the origin can be reviewed before the Next.js application exists.
- Directory listing is disabled and responses carry `X-Robots-Tag: noindex, nofollow, noarchive`; `robots.txt` disallows crawling.
- The origin returns HTTP 200 when addressed with the staging host.
- Public DNS is hosted by Cloudflare, not cPanel. The staging site becomes publicly reachable after adding a proxied or DNS-only `A` record for `staging` pointing to the cPanel origin IP and allowing Cloudflare/AutoSSL to issue or serve HTTPS.
- Public DNS activation is intentionally deferred until deployment because the client does not currently have access to the Cloudflare account that owns the zone. Do not change nameservers or add the domain to a different Cloudflare account as a workaround.
- When Phase 1 produces the real application, replace the temporary static reference with a Node 22/Passenger staging app and give it separate database credentials and media root.

## Staging media root (2026-09-25)

Provisioned and checked over SSH for Phase 6. Only Rivana's own staging paths were touched; the account also hosts other, unrelated sites.

- Created `~/rivana-staging/media` (home-relative) with a `quarantine/` subfolder, both mode `750` and owned by the account user. It is outside `public_html`, outside the `staging.rivanaresidence.com` document root, and outside any future release directory, so no URL maps to it. Images are served only through the application's `/media/` route.
- Checked the operations the storage adapter relies on, then removed the test files:
  - exclusive create;
  - a same-filesystem hard link from quarantine into `images/`;
  - a second link to an existing key is refused, so objects cannot be overwritten;
  - new files are created with mode `640`.
- Account capacity: about 4.0 GB used with no fixed megabyte quota, and 70,376 of 600,000 inodes used (88% of inodes free).
- **Risk:** the shared filesystem behind the account reports **99% used (about 61 GB free)** at the provider level. The account is under its own quota, but disk exhaustion by other tenants would affect uploads. Ask Hosting.com about capacity, and add a free-space alert before launch.
- **Image processing:** the server is `x86_64` with glibc `2.28` and Node `22.23.2` (`/opt/alt/alt-nodejs22`). sharp 0.35's prebuilt Linux binaries require glibc ≥ 2.28, so the pinned version is compatible, but only just. Check the glibc requirement before upgrading sharp.
- Staging environment value: `MEDIA_STORAGE_ROOT=<home>/rivana-staging/media` (absolute path in the app's cPanel environment settings).

Still open: an off-server backup of the media root and a restore drill, which remain launch tasks. Production gets its own separate root (e.g. `~/rivana-production/media`) when production is provisioned.
