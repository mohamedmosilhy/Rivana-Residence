import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffBranch } from "@/app/api/v1/_dto/branches";
import { updateBranch } from "@/composition/api";
import { BranchPatch } from "@/contracts/api/v1/branches";

// API-A3 PATCH /api/v1/staff/branches/{id}: Admin only; audited, and
// expires that branch's public cache tags.
export const PATCH = staffRoute(
  { route: "/api/v1/staff/branches/[id]", body: BranchPatch },
  async ({ staff, params, body, setBranch }) => {
    const id = String(params.id);
    setBranch(id);
    return toHttp(await updateBranch(staff, id, body), {
      ok: (branch) => json(200, staffBranch(branch)),
    });
  },
);
