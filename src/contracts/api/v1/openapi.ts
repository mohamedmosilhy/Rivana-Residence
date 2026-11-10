import { z } from "zod";

import {
  BranchDetail,
  BranchInput,
  BranchList,
  BranchPatch,
  BranchSummary,
  Image,
  RoomTypeDetail,
  RoomTypeList,
  RoomTypeSummary,
  StaffBranch,
  StaffBranchList,
} from "./branches";
import { HealthResponse } from "./health";
import {
  Block,
  BlockInput,
  BlockList,
  BlockPatch,
  PhysicalRoom,
  PhysicalRoomInput,
  PhysicalRoomList,
  PhysicalRoomPatch,
} from "./inventory";
import {
  BaseRateInput,
  NightPrice,
  RateCalendar,
  RatePeriod,
  RatePeriodInput,
  RatePeriodPatch,
} from "./pricing";
import { Money, Occupancy, Problem, Stay } from "./primitives";
import { API_ROUTES, type ApiRoute } from "./routes";

// Builds the OpenAPI 3.1 document from the contract schemas with Zod 4's
// `z.toJSONSchema()` (ADR 014). Pure and deterministic, so the freshness
// test can rebuild it in memory and compare with docs/api/openapi.json.

/** Every named schema, in the order it appears under components. */
const COMPONENTS: Readonly<Record<string, z.ZodType>> = {
  Problem,
  Money,
  Stay,
  Occupancy,
  HealthResponse,
  Image,
  BranchSummary,
  BranchDetail,
  BranchList,
  RoomTypeSummary,
  RoomTypeDetail,
  RoomTypeList,
  StaffBranch,
  StaffBranchList,
  BranchInput,
  BranchPatch,
  PhysicalRoom,
  PhysicalRoomList,
  PhysicalRoomInput,
  PhysicalRoomPatch,
  Block,
  BlockList,
  BlockInput,
  BlockPatch,
  BaseRateInput,
  RatePeriod,
  NightPrice,
  RateCalendar,
  RatePeriodInput,
  RatePeriodPatch,
};

function componentSchemas() {
  const registry = z.registry<{ id: string }>();
  for (const [id, schema] of Object.entries(COMPONENTS)) {
    registry.add(schema, { id });
  }
  const { schemas } = z.toJSONSchema(registry, {
    uri: (id) => `#/components/schemas/${id}`,
    unrepresentable: "any",
  });
  return Object.fromEntries(
    Object.keys(COMPONENTS).map((id) => {
      // OpenAPI components carry no per-schema dialect or id.
      const schema = { ...(schemas[id] as Record<string, unknown>) };
      delete schema.$schema;
      delete schema.$id;
      return [id, schema];
    }),
  );
}

function refFor(schema: z.ZodType) {
  const name = Object.entries(COMPONENTS).find(
    ([, candidate]) => candidate === schema,
  )?.[0];
  if (!name) {
    throw new Error("Register every contract schema used by a route.");
  }
  return { $ref: `#/components/schemas/${name}` };
}

const problemContent = {
  "application/problem+json": {
    schema: { $ref: "#/components/schemas/Problem" },
  },
};

/** Path parameters from `{name}` segments, then the query schema's keys. */
function parameters(route: ApiRoute) {
  const path = [...route.path.matchAll(/\{([^}]+)\}/g)].map((match) => ({
    name: match[1],
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
  const query = route.query
    ? Object.entries(route.query.shape).map(([name, schema]) => {
        const json = z.toJSONSchema(schema as z.ZodType, {
          unrepresentable: "any",
          io: "input",
        }) as Record<string, unknown>;
        delete json.$schema;
        return {
          name,
          in: "query",
          required: !(schema as z.ZodType).safeParse(undefined).success,
          schema: json,
        };
      })
    : [];
  return [...path, ...query];
}

function operation(route: ApiRoute) {
  const responses: Record<string, unknown> = {};
  for (const [status, response] of Object.entries(route.responses)) {
    responses[status] = {
      description: response.description,
      ...(response.schema
        ? {
            content: {
              "application/json": { schema: refFor(response.schema) },
            },
          }
        : {}),
    };
  }
  responses.default = {
    description: `Problem details. Codes: ${["INTERNAL", ...route.errors].join(", ")}.`,
    content: problemContent,
  };
  return {
    operationId: route.operationId,
    summary: route.summary,
    tags: [route.tag],
    security: route.security === "staff" ? [{ staffSession: [] }] : [],
    ...(parameters(route).length > 0 ? { parameters: parameters(route) } : {}),
    ...(route.request
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: refFor(route.request) } },
          },
        }
      : {}),
    responses,
  };
}

export function buildOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of API_ROUTES) {
    (paths[route.path] ??= {})[route.method] = operation(route);
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Rivana Residence API",
      version: "1.0.0",
      description:
        "Generated from src/contracts/api/v1 by `npm run openapi`. Errors use RFC 9457 problem details (docs/api/error-model.md).",
    },
    servers: [{ url: "/" }],
    paths,
    components: {
      schemas: componentSchemas(),
      securitySchemes: {
        staffSession: {
          type: "apiKey",
          in: "cookie",
          name: "__Secure-rivana-staff.session_token",
          description:
            "Production Better Auth staff session cookie (rivana-staff.session_token in development), scoped to /. Same origin only; unsafe methods also require a same-origin Origin header.",
        },
      },
    },
  };
}

/** The exact text written to docs/api/openapi.json. */
export function serializeOpenApiDocument() {
  return `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;
}
