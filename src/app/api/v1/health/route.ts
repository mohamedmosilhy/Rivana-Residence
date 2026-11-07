import { json, publicRoute, toHttp } from "@/app/api/v1/_http";
import { checkHealth } from "@/composition/api";

// GET /api/v1/health: 200 when the app and its database answer, 503 problem
// otherwise. Reports no version or environment details.
export const GET = publicRoute({ route: "/api/v1/health" }, async () =>
  toHttp(await checkHealth(), { ok: (status) => json(200, status) }),
);
