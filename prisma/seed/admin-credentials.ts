import { passwordPolicyIssues } from "../../src/domain/auth/password-policy.ts";

// The initial administrator of `npm run db:seed`. There is no default
// password: provisioning needs a supplied credential in every environment, so
// a fresh database can never hold a known administrator login (audit F07).
export const SEED_ADMIN = {
  email: "admin@rivanaresidence.com",
  name: "Rivana Admin",
} as const;

export type SeedAdminCredentials =
  | Readonly<{ ok: true; password: string }>
  | Readonly<{ ok: false; issues: readonly string[] }>;

/**
 * Reads `SEED_ADMIN_PASSWORD` and checks it against the staff password
 * policy. Pure: the script calls it before touching the database or media
 * storage, so a refused run changes nothing.
 */
export function resolveSeedAdminCredentials(
  env: Readonly<Record<string, string | undefined>>,
): SeedAdminCredentials {
  const password = env.SEED_ADMIN_PASSWORD;
  if (!password) {
    return {
      ok: false,
      issues: [
        "Set SEED_ADMIN_PASSWORD to a strong password; the seed has no default.",
      ],
    };
  }
  const issues = passwordPolicyIssues(password, SEED_ADMIN);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, password };
}
