import { syncStatus } from "@/app/api/v1/_dto/branch-sync";
import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffBranchSync } from "@/composition/branch-sync";
import {
  SyncCheckpointRequest,
  SyncQuery,
} from "@/contracts/api/v1/branch-sync";

export const POST = staffRoute(
  {
    route: "/api/v1/staff/branches/[id]/sync-checkpoints",
    body: SyncCheckpointRequest,
    query: SyncQuery,
  },
  async ({ staff, params, body, setBranch }) => {
    const branchId = String(params.id);
    return toHttp(
      await staffBranchSync().recordCheckpoint.execute(staff, branchId, body),
      {
        ok: (status) => {
          setBranch(branchId);
          return json(201, syncStatus(status));
        },
      },
    );
  },
);
