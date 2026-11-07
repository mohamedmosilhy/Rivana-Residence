// The first branch, created by the M4 migration. The old public URLs
// (`/about`, `/rooms`, legacy `*.html`) redirect here permanently
// (next.config.ts), so it can never be deactivated (spec 0002). Kept free
// of imports so next.config.ts can load it without path aliases.
export const DEFAULT_BRANCH_ID = "cwiuqp6uf1q5i1ic4vhawnmw";
export const DEFAULT_BRANCH_SLUG = "new-cairo";

export const DEFAULT_BRANCH_DEACTIVATION_MESSAGE =
  "This branch receives the old website addresses and cannot be deactivated.";
