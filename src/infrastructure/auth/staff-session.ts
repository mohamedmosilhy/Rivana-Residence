import "server-only";

import type { StaffDirectory, StaffPrincipal } from "@/application/auth/ports";
import { isBranchScopedRole } from "@/domain/auth/capabilities";
import type { Auth } from "@/infrastructure/auth/better-auth";

// The authoritative session check: a valid, unexpired database session whose
// user still exists and is active. Deactivated users lose every session.
// Role and branch assignments are read on every request, so a change takes
// effect on the next request (ADR 018).
export async function resolveStaffSession(
  auth: Auth,
  directory: StaffDirectory,
  headers: Headers,
): Promise<StaffPrincipal | null> {
  const result = await auth.api.getSession({ headers });
  if (!result) return null;

  const account = await directory.findById(result.user.id);
  if (!account) return null;
  if (!account.active) {
    await directory.revokeSessions(account.id);
    return null;
  }

  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    sessionId: result.session.id,
    branchIds: isBranchScopedRole(account.role)
      ? await directory.listBranchIds(account.id)
      : [],
  };
}
