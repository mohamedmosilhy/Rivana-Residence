import { json, publicRoute } from "@/app/api/v1/_http";
import { branchSummary } from "@/app/api/v1/_dto/branches";
import { listPublicBranches } from "@/composition/api";

// API-P1 GET /api/v1/branches: active branches by display order (chooser).
export const GET = publicRoute({ route: "/api/v1/branches" }, async () =>
  json(200, { items: (await listPublicBranches()).map(branchSummary) }),
);
