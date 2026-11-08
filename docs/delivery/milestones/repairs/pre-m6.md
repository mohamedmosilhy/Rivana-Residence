# Pre M6 repair gate

These tasks must be completed before the M6 deployment rehearsal. They protect fresh provisioning and public branch data.

## Task breakdown

| Task | Finding | Title | Risk | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| PRE-M6-R1 | F07 | Secure initial administrator seed | High | — | Accepted (committed 742d9cb) |
| PRE-M6-R2 | F08 | Populate branch owned contact and location data | Medium | PRE-M6-R1 | Accepted (delivered inside SEED-1) |
| SEED-1 | F08 | One seed: `npm run db:seed` with steps structure, admin, branch, content; removes `db:seed:initial` | High | PRE-M6-R1 | Accepted |
| SEED-2 | — | `--demo` flag (demo branch) with a production guard; removes `db:seed:demo` | Medium | SEED-1 | Accepted |

## PRE-M6-R1, F07

The initial seed must require a supplied strong administrator credential and must never create or reset an administrator to a known weak password.

Done when a fresh provisioning run refuses missing or weak credentials, existing accounts are not silently reset, and repeat seed tests cover the credential behavior.

## PRE-M6-R2, F08

Fresh initial content must populate the branch fields used by public contact and map pages, not only the legacy site settings record.

Done when a fresh database has complete branch contact and location data, a repeat seed preserves intended edits, and a public browser check renders the seeded values.
