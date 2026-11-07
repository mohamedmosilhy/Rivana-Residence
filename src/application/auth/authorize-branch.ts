import { authorize } from "@/application/auth/authorize";
import type { StaffPrincipal } from "@/application/auth/ports";
import { failure, success, type Result } from "@/application/shared/result";
import {
  isBranchScopedRole,
  type Capability,
} from "@/domain/auth/capabilities";

/**
 * Capability plus branch check (ADR 018). Admin passes for every branch.
 * Receptionist and Manager pass only for assigned branches. Editor is always
 * refused: Editors have no branch scope (Q-01). Use cases that load a
 * resource first should map an out-of-scope resource to NOT_FOUND instead,
 * so ids do not reveal what exists in other branches.
 */
export function authorizeBranch(
  staff: StaffPrincipal | null,
  capability: Capability,
  branchId: string,
): Result<StaffPrincipal> {
  const access = authorize(staff, capability);
  if (!access.ok) return access;
  const principal = access.value;
  if (principal.role === "ADMIN") return success(principal);
  if (
    isBranchScopedRole(principal.role) &&
    principal.branchIds.includes(branchId)
  ) {
    return success(principal);
  }
  return failure("FORBIDDEN", "You do not have access to this branch.");
}

/** Which branches a list query may return for this principal. */
export type BranchScope = "ALL" | readonly string[];

/**
 * The branch filter for list queries. Admin and Editor read every branch
 * (Editors keep enquiries per Q-26 and the capability matrix, although
 * `authorizeBranch` refuses them). Receptionists and Managers read only their
 * assigned branches; with no assignment the list is empty.
 */
export function branchScope(staff: StaffPrincipal): BranchScope {
  return isBranchScopedRole(staff.role) ? staff.branchIds : "ALL";
}

export function inBranchScope(scope: BranchScope, branchId: string | null) {
  if (scope === "ALL") return true;
  return branchId !== null && scope.includes(branchId);
}
