import { branchScope } from "@/application/auth/authorize-branch";
import { authorize } from "@/application/auth/authorize";
import type { StaffPrincipal } from "@/application/auth/ports";
import { success, type Result } from "@/application/shared/result";

import type { BranchRepository, BranchRow } from "./ports";

/**
 * The caller's branches (API-A1, `inventory:read`): Admin sees every branch,
 * Receptionists and Managers only their assignments.
 */
export class ListBranches {
  constructor(private readonly branches: BranchRepository) {}

  async forStaff(
    staff: StaffPrincipal | null,
  ): Promise<Result<readonly BranchRow[]>> {
    const access = authorize(staff, "inventory:read");
    if (!access.ok) return access;
    const scope = branchScope(access.value);
    const all = await this.branches.listRows();
    return success(
      scope === "ALL" ? all : all.filter((branch) => scope.includes(branch.id)),
    );
  }
}
