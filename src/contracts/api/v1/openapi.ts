import { z } from "zod";

import { HealthResponse } from "./health";
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
          name: "rivana.session_token",
          description:
            "Better Auth staff session cookie. Same origin only; unsafe methods also require a same-origin Origin header.",
        },
      },
    },
  };
}

/** The exact text written to docs/api/openapi.json. */
export function serializeOpenApiDocument() {
  return `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;
}
