// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { DEFAULT_MAX_BODY_BYTES } from "@/app/api/v1/_http/body";
import type { ErrorLogLine, RequestLogLine } from "@/app/api/v1/_http/logger";
import { PROBLEMS, problem } from "@/app/api/v1/_http/problem";
import {
  createRoutes,
  json,
  toHttp,
  type HttpDependencies,
} from "@/app/api/v1/_http/routes";
import type { StaffPrincipal } from "@/application/auth/ports";
import {
  failure,
  type ApplicationErrorCode,
} from "@/application/shared/result";

// T-HTTP-1…6 over plain Request objects (spec 0001, AC-3 and AC-9).

const ORIGIN = "http://localhost:3000";
const URL_BASE = `${ORIGIN}/api/v1/test`;

const staffMember: StaffPrincipal = {
  id: "staff-1",
  name: "Rana",
  email: "rana@example.test",
  role: "RECEPTIONIST",
  sessionId: "session-1",
  branchIds: ["branch-1"],
};

function setup(overrides: Partial<HttpDependencies> = {}) {
  const requests: RequestLogLine[] = [];
  const errors: ErrorLogLine[] = [];
  const deps: HttpDependencies = {
    isSameOrigin: (request) => request.headers.get("origin") === ORIGIN,
    resolveStaff: vi.fn(async (headers: Headers) =>
      headers.get("cookie")?.includes("rivana.session_token=valid")
        ? staffMember
        : null,
    ),
    rateLimit: vi.fn(async () => ({ allowed: true as const })),
    log: {
      request: (line) => requests.push(line),
      error: (line) => errors.push(line),
    },
    now: () => 0,
    ...overrides,
  };
  return { ...createRoutes(deps), deps, requests, errors };
}

const body = z.object({ name: z.string().min(1) }).strict();

function post(
  init: Readonly<{
    body?: BodyInit | null;
    headers?: Record<string, string>;
  }> = {},
) {
  return new Request(URL_BASE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      cookie: "rivana.session_token=valid",
      ...init.headers,
    },
    body:
      init.body === undefined ? JSON.stringify({ name: "Nile" }) : init.body,
    duplex: "half",
  } as RequestInit);
}

async function read(response: Response) {
  return {
    status: response.status,
    type: response.headers.get("content-type"),
    body: (await response.json()) as Record<string, unknown>,
  };
}

describe("problem mapping", () => {
  const applicationCodes: readonly ApplicationErrorCode[] = [
    "CONFLICT",
    "FORBIDDEN",
    "RATE_LIMITED",
    "UNAUTHENTICATED",
    "INVALID_CREDENTIALS",
    "NOT_FOUND",
    "NOT_PUBLISHABLE",
    "REFERENCED",
    "TRY_AGAIN",
    "VALIDATION",
  ];

  it("has exactly one status for every application code", () => {
    for (const code of applicationCodes) {
      expect(PROBLEMS[code].status).toBeGreaterThanOrEqual(400);
    }
  });

  it.each([
    ["VALIDATION", 422],
    ["UNAUTHENTICATED", 401],
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
    ["CONFLICT", 409],
    ["RATE_LIMITED", 429],
    ["TRY_AGAIN", 503],
    ["MALFORMED_JSON", 400],
    ["INVALID_QUERY", 400],
    ["PAYLOAD_TOO_LARGE", 413],
    ["UNSUPPORTED_MEDIA_TYPE", 415],
    ["CROSS_SITE_REQUEST", 403],
    ["INTERNAL", 500],
  ] as const)("maps %s to %i as in the error model", (code, status) => {
    expect(PROBLEMS[code].status).toBe(status);
  });

  it("serializes an RFC 9457 body with a stable type and request id", async () => {
    const response = problem("NOT_FOUND", {
      requestId: "req-1",
      detail: "Room not found.",
    });
    expect(await read(response)).toEqual({
      status: 404,
      type: "application/problem+json",
      body: {
        type: "https://rivanaresidence.com/problems/not-found",
        title: "Not found",
        status: 404,
        code: "NOT_FOUND",
        detail: "Room not found.",
        requestId: "req-1",
      },
    });
  });

  it("adds Retry-After to 503 and 429 problems only", () => {
    expect(
      problem("TRY_AGAIN", { requestId: "r" }).headers.get("retry-after"),
    ).toBe("5");
    expect(
      problem("RATE_LIMITED", { requestId: "r", retryAfter: 42 }).headers.get(
        "retry-after",
      ),
    ).toBe("42");
    expect(
      problem("NOT_FOUND", { requestId: "r" }).headers.get("retry-after"),
    ).toBeNull();
  });
});

describe("staffRoute refusals (AC-3)", () => {
  function route() {
    const { staffRoute, requests, deps } = setup();
    const handler = vi.fn(async () => json(201, { ok: true }));
    return {
      handler,
      requests,
      deps,
      POST: staffRoute({ route: "/api/v1/test", body }, handler),
    };
  }

  it("runs the handler with the parsed body and the principal", async () => {
    const { POST, handler } = route();
    const response = await POST(post());
    expect(response.status).toBe(201);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ body: { name: "Nile" }, staff: staffMember }),
    );
  });

  it("returns 415 for a non-JSON content type without reading the body (T-HTTP-1)", async () => {
    const { POST, handler } = route();
    const result = await read(
      await POST(post({ headers: { "content-type": "text/plain" } })),
    );
    expect(result).toMatchObject({
      status: 415,
      type: "application/problem+json",
      body: { code: "UNSUPPORTED_MEDIA_TYPE" },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 413 when Content-Length declares more than the cap (T-HTTP-2)", async () => {
    const { POST, handler } = route();
    const response = await POST(
      post({
        headers: { "content-length": String(DEFAULT_MAX_BODY_BYTES + 1) },
        body: "{}",
      }),
    );
    expect((await read(response)).body.code).toBe("PAYLOAD_TOO_LARGE");
    expect(response.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 413 for a streamed body over the cap with no Content-Length", async () => {
    const { POST, handler } = route();
    const big = new TextEncoder().encode(
      JSON.stringify({ name: "x".repeat(DEFAULT_MAX_BODY_BYTES) }),
    );
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(big.slice(0, 1024));
        controller.enqueue(big.slice(1024));
        controller.close();
      },
    });
    const response = await POST(post({ body: stream }));
    expect(response.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON (T-HTTP-3)", async () => {
    const { POST, handler } = route();
    const result = await read(await POST(post({ body: '{"name": "Nile"' })));
    expect(result).toMatchObject({
      status: 400,
      body: { code: "MALFORMED_JSON" },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 422 with fieldErrors for an unknown field (T-HTTP-4)", async () => {
    const { POST, handler } = route();
    const result = await read(
      await POST(
        post({ body: JSON.stringify({ name: "Nile", role: "ADMIN" }) }),
      ),
    );
    expect(result).toMatchObject({
      status: 422,
      body: {
        code: "VALIDATION",
        fieldErrors: { role: ["Unknown field."] },
      },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("keys nested and missing field errors by dotted path", async () => {
    const { staffRoute } = setup();
    const POST = staffRoute(
      {
        route: "/api/v1/test",
        body: z.object({ guest: z.object({ email: z.email() }) }).strict(),
      },
      async () => json(200, {}),
    );
    const result = await read(
      await POST(post({ body: JSON.stringify({ guest: { email: "no" } }) })),
    );
    expect(Object.keys(result.body.fieldErrors as object)).toEqual([
      "guest.email",
    ]);
  });

  it("returns 403 CROSS_SITE_REQUEST for a foreign Origin (T-HTTP-5)", async () => {
    const { POST, handler, deps } = route();
    const result = await read(
      await POST(post({ headers: { origin: "https://evil.example" } })),
    );
    expect(result).toMatchObject({
      status: 403,
      body: { code: "CROSS_SITE_REQUEST" },
    });
    expect(handler).not.toHaveBeenCalled();
    expect(deps.resolveStaff).not.toHaveBeenCalled();
  });

  it("returns 401 when signed out (T-HTTP-6)", async () => {
    const { POST, handler } = route();
    const result = await read(await POST(post({ headers: { cookie: "" } })));
    expect(result).toMatchObject({
      status: 401,
      body: { code: "UNAUTHENTICATED" },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not demand a same-origin header on a staff GET", async () => {
    const { staffRoute } = setup();
    const GET = staffRoute({ route: "/api/v1/test" }, async () =>
      json(200, { ok: true }),
    );
    const response = await GET(
      new Request(URL_BASE, {
        headers: { cookie: "rivana.session_token=valid" },
      }),
    );
    expect(response.status).toBe(200);
  });
});

describe("handler results and responses", () => {
  it("maps a failed application result through the problem table", async () => {
    const { publicRoute } = setup();
    const GET = publicRoute({ route: "/api/v1/test" }, async () =>
      failure("NOT_FOUND", "This room no longer exists."),
    );
    expect(await read(await GET(new Request(URL_BASE)))).toMatchObject({
      status: 404,
      body: { code: "NOT_FOUND", detail: "This room no longer exists." },
    });
  });

  it("maps success through toHttp", async () => {
    const { publicRoute } = setup();
    const GET = publicRoute({ route: "/api/v1/test" }, async () =>
      toHttp({ ok: true, value: { id: "a" } }, { ok: (v) => json(200, v) }),
    );
    expect((await read(await GET(new Request(URL_BASE)))).body).toEqual({
      id: "a",
    });
  });

  it("sets no-store, nosniff, and the request id on every response", async () => {
    const { publicRoute } = setup();
    const GET = publicRoute({ route: "/api/v1/test" }, async () =>
      json(200, {}),
    );
    const response = await GET(
      new Request(URL_BASE, { headers: { "x-request-id": "abc-123" } }),
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-request-id")).toBe("abc-123");
  });

  it("keeps a handler's own Cache-Control", async () => {
    const { publicRoute } = setup();
    const GET = publicRoute({ route: "/api/v1/test" }, async () =>
      json(200, {}, { "Cache-Control": "private, max-age=0, must-revalidate" }),
    );
    expect(
      (await GET(new Request(URL_BASE))).headers.get("cache-control"),
    ).toBe("private, max-age=0, must-revalidate");
  });

  it("replaces an unsafe incoming request id with a generated one", async () => {
    const { publicRoute } = setup();
    const GET = publicRoute({ route: "/api/v1/test" }, async () =>
      json(200, {}),
    );
    const id = (
      await GET(
        new Request(URL_BASE, {
          headers: { "x-request-id": "<script>alert(1)</script>" },
        }),
      )
    ).headers.get("x-request-id");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("validates query parameters and returns 400 INVALID_QUERY", async () => {
    const { publicRoute } = setup();
    const GET = publicRoute(
      {
        route: "/api/v1/test",
        query: z.object({ page: z.coerce.number().int().min(1) }).strict(),
      },
      async ({ query }) => json(200, query),
    );
    expect(
      (await read(await GET(new Request(`${URL_BASE}?page=2`)))).body,
    ).toEqual({ page: 2 });
    expect(
      await read(await GET(new Request(`${URL_BASE}?page=2&sort=x`))),
    ).toMatchObject({ status: 400, body: { code: "INVALID_QUERY" } });
  });

  it("passes awaited route params to the handler", async () => {
    const { publicRoute } = setup();
    const GET = publicRoute(
      { route: "/api/v1/test/[id]" },
      async ({ params }) => json(200, params),
    );
    const response = await GET(new Request(URL_BASE), {
      params: Promise.resolve({ id: "room-1" }),
    });
    expect((await read(response)).body).toEqual({ id: "room-1" });
  });
});

describe("publicRoute rate limit", () => {
  it("returns 429 with Retry-After when the client is locked", async () => {
    const { publicRoute } = setup({
      rateLimit: async () => ({ allowed: false, retryAfterSeconds: 90 }),
    });
    const handler = vi.fn(async () => json(200, {}));
    const GET = publicRoute(
      {
        route: "/api/v1/test",
        rateLimit: {
          name: "test",
          rule: { maxFailures: 1, windowMs: 1000, lockMs: 1000 },
        },
      },
      handler,
    );
    const response = await GET(new Request(URL_BASE));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("90");
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("webhookRoute", () => {
  it("passes the exact raw bytes and headers, with no session or CSRF", async () => {
    const { webhookRoute, deps } = setup();
    const raw = new TextEncoder().encode('{"obj":{"id":1},"hmac":"x"}');
    let received: Uint8Array | null = null;
    const POST = webhookRoute(
      { route: "/api/v1/payments/test" },
      async ({ rawBody, headers }) => {
        received = rawBody;
        expect(headers.get("x-signature")).toBe("sig");
        return json(200, {});
      },
    );
    const response = await POST(
      new Request(URL_BASE, {
        method: "POST",
        headers: { origin: "https://accept.paymob.com", "x-signature": "sig" },
        body: raw,
      }),
    );
    expect(response.status).toBe(200);
    expect(received).toEqual(raw);
    expect(deps.resolveStaff).not.toHaveBeenCalled();
  });

  it("refuses an oversize webhook body", async () => {
    const { webhookRoute } = setup();
    const handler = vi.fn(async () => json(200, {}));
    const POST = webhookRoute(
      { route: "/api/v1/payments/test", maxBytes: 8 },
      handler,
    );
    const response = await POST(
      new Request(URL_BASE, { method: "POST", body: "0123456789" }),
    );
    expect(response.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("unexpected errors", () => {
  it("returns 500 with only the request id and logs no error message", async () => {
    const { publicRoute, errors } = setup();
    const GET = publicRoute({ route: "/api/v1/test" }, async () => {
      throw new Error('duplicate key "guest@example.test" secret-sql');
    });
    const response = await GET(
      new Request(URL_BASE, { headers: { "x-request-id": "req-500" } }),
    );
    const result = await read(response);
    expect(result).toEqual({
      status: 500,
      type: "application/problem+json",
      body: {
        type: "https://rivanaresidence.com/problems/internal",
        title: "Something went wrong",
        status: 500,
        code: "INTERNAL",
        requestId: "req-500",
      },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ requestId: "req-500", error: "Error" });
    expect(JSON.stringify(errors)).not.toContain("secret-sql");
    expect(JSON.stringify(errors)).not.toContain("guest@example.test");
  });
});

// AC-9: no log line holds a body, cookie, token, or Authorization value.
describe("request logging and redaction", () => {
  const secrets = {
    cookie: "rivana.session_token=valid; other=cookie-secret-123",
    authorization: "Bearer token-secret-456",
    body: JSON.stringify({ name: "body-secret-789" }),
  };

  it("writes one allow-listed line per request with no secrets", async () => {
    const { staffRoute, requests, errors } = setup();
    const POST = staffRoute(
      { route: "/api/v1/staff/things/[id]", body },
      async ({ setBranch }) => {
        setBranch("branch-1");
        return json(201, {});
      },
    );
    await POST(
      new Request(`${ORIGIN}/api/v1/staff/things/thing-1?token=query-secret`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          cookie: secrets.cookie,
          authorization: secrets.authorization,
          "x-request-id": "req-log",
        },
        body: secrets.body,
      }),
    );
    expect(requests).toEqual([
      {
        requestId: "req-log",
        method: "POST",
        route: "/api/v1/staff/things/[id]",
        status: 201,
        durationMs: 0,
        principal: "staff-1",
        branchId: "branch-1",
      },
    ]);
    const logged = JSON.stringify([...requests, ...errors]);
    for (const secret of [
      "cookie-secret-123",
      "token-secret-456",
      "body-secret-789",
      "query-secret",
      "thing-1",
    ]) {
      expect(logged).not.toContain(secret);
    }
  });

  it("logs refusals and public requests as public", async () => {
    const { staffRoute, requests } = setup();
    const POST = staffRoute({ route: "/api/v1/test", body }, async () =>
      json(200, {}),
    );
    await POST(post({ headers: { cookie: "" } }));
    expect(requests).toEqual([
      expect.objectContaining({ status: 401, principal: "public" }),
    ]);
  });

  it("logs through console with the same allow list by default", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const { publicRoute } = createRoutes({
        isSameOrigin: () => true,
        resolveStaff: async () => null,
        rateLimit: async () => ({ allowed: true }),
      });
      await publicRoute({ route: "/api/v1/test" }, async () => json(200, {}))(
        new Request(URL_BASE, {
          headers: { authorization: secrets.authorization },
        }),
      );
      expect(info).toHaveBeenCalledTimes(1);
      const line = JSON.parse(String(info.mock.calls[0]![0])) as Record<
        string,
        unknown
      >;
      expect(Object.keys(line).sort()).toEqual(
        [
          "branchId",
          "durationMs",
          "event",
          "method",
          "principal",
          "requestId",
          "route",
          "status",
        ].sort(),
      );
      expect(JSON.stringify(line)).not.toContain("token-secret-456");
    } finally {
      info.mockRestore();
    }
  });
});
