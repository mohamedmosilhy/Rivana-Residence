import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffBranch } from "@/app/api/v1/_dto/branches";
import { createBranch, listStaffBranches } from "@/composition/api";
import { BranchInput } from "@/contracts/api/v1/branches";

// API-A1 GET /api/v1/staff/branches: the caller's branches (Admin: all).
export const GET = staffRoute(
  { route: "/api/v1/staff/branches" },
  async ({ staff }) =>
    toHttp(await listStaffBranches(staff), {
      ok: (branches) => json(200, { items: branches.map(staffBranch) }),
    }),
);

// API-A2 POST /api/v1/staff/branches: Admin only; seeds the three pages.
export const POST = staffRoute(
  { route: "/api/v1/staff/branches", body: BranchInput },
  async ({ staff, body }) =>
    toHttp(await createBranch(staff, body), {
      ok: (branch) => json(201, staffBranch(branch)),
    }),
);
