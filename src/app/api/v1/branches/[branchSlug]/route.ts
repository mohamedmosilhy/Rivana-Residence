import { failure } from "@/application/shared/result";
import { json, publicRoute } from "@/app/api/v1/_http";
import { branchDetail } from "@/app/api/v1/_dto/branches";
import { getPublicBranch } from "@/composition/api";

// API-P2 GET /api/v1/branches/{branchSlug}: 404 when unknown or inactive.
export const GET = publicRoute(
  { route: "/api/v1/branches/[branchSlug]" },
  async ({ params, setBranch }) => {
    const branch = await getPublicBranch(String(params.branchSlug));
    if (!branch) return failure("NOT_FOUND", "No such branch.");
    setBranch(branch.id);
    return json(200, branchDetail(branch));
  },
);
