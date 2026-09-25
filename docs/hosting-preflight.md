# Hosting.com/cPanel preflight

Checked read-only over the existing SSH connection on 2026-09-25. Hostnames, usernames, keys, and absolute account paths are intentionally omitted.

## Confirmed

- SSH access works with the dedicated Rivana deployment key.
- CloudLinux Node Selector is enabled with Passenger active.
- Node.js `22.23.2` is available for an application even though the login shell defaults to obsolete Node `10.24.0`; deployment commands must enter the Node 22 selector environment explicitly.
- `rsync` and user cron are available.
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
