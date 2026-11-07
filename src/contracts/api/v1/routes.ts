import type { z } from "zod";

import { HealthResponse } from "./health";

/** One documented endpoint. The OpenAPI document is generated from these. */
export type ApiRoute = Readonly<{
  method: "get" | "post" | "put" | "patch" | "delete";
  /** OpenAPI path, e.g. `/api/v1/staff/reservations/{id}`. */
  path: string;
  operationId: string;
  summary: string;
  tag: string;
  security: "public" | "staff" | "webhook";
  request?: z.ZodType;
  responses: Readonly<
    Record<number, Readonly<{ description: string; schema?: z.ZodType }>>
  >;
  /** Problem codes this endpoint can return. */
  errors: readonly string[];
}>;

export const API_ROUTES: readonly ApiRoute[] = [
  {
    method: "get",
    path: "/api/v1/health",
    operationId: "getHealth",
    summary: "Report whether the app and its database are answering.",
    tag: "System",
    security: "public",
    responses: {
      200: {
        description: "The app and database are up.",
        schema: HealthResponse,
      },
    },
    errors: ["TRY_AGAIN"],
  },
];
