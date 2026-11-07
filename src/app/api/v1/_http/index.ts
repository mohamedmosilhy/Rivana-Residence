import "server-only";

import { httpDependencies } from "@/composition/api";

import { createRoutes } from "./routes";

// The wrappers every `/api/v1/**/route.ts` uses, wired to the composition
// root. Tests build their own with `createRoutes` and fakes.
export const { publicRoute, staffRoute, webhookRoute } =
  createRoutes(httpDependencies);

export { json, toHttp, type HandlerResult } from "./routes";
export { parseJson, validate } from "./body";
export { problem } from "./problem";
