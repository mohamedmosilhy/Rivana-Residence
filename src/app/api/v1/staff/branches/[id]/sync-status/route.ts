import { syncStatus } from "@/app/api/v1/_dto/branch-sync";
import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffBranchSync } from "@/composition/branch-sync";
import { SyncQuery } from "@/contracts/api/v1/branch-sync";

export const GET = staffRoute(
  { route: "/api/v1/staff/branches/[id]/sync-status", query: SyncQuery },
  async ({ staff, params, setBranch }) => {
    const branchId = String(params.id);
    return toHttp(await staffBranchSync().getStatus.execute(staff, branchId), {
      ok: (status) => {
        setBranch(branchId);
        return json(200, syncStatus(status));
      },
    });
  },
);
