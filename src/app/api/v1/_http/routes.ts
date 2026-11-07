import type { z } from "zod";

import type { StaffPrincipal } from "@/application/auth/ports";
import type { RateLimitOutcome } from "@/application/shared/rate-limit";
import type { ApplicationError, Result } from "@/application/shared/result";
import type { ThrottleRule } from "@/domain/auth/login-throttle";

import {
  DEFAULT_MAX_BODY_BYTES,
  parseJson,
  readRawBody,
  validate,
  type BodyFailure,
} from "./body";
import {
  consoleLogSink,
  errorName,
  requestIdFor,
  stackFrames,
  type LogSink,
} from "./logger";
import { problem, problemFromError, type ProblemCode } from "./problem";

/**
 * A handler returns a response, or a failed application result to map (for
 * example `failure("NOT_FOUND", …)` or a use case's failed `Result`).
 */
export type HandlerResult =
  | Response
  | Readonly<{ ok: false; error: ApplicationError }>
  | Result<never>;

type Params = Readonly<Record<string, string | string[] | undefined>>;
type NextContext = Readonly<{ params?: Promise<Params> }>;
export type RouteHandler = (
  request: Request,
  context?: NextContext,
) => Promise<Response>;

type BaseContext<Body, Query> = Readonly<{
  request: Request;
  requestId: string;
  params: Params;
  body: Body;
  query: Query;
  /** Records the branch for the request log line only. */
  setBranch(branchId: string | null): void;
}>;

type RouteOptions<Body, Query> = Readonly<{
  /** The route pattern, logged instead of the raw path. */
  route: string;
  body?: z.ZodType<Body>;
  query?: z.ZodType<Query>;
  maxBytes?: number;
}>;

export type HttpDependencies = Readonly<{
  isSameOrigin(request: Request): boolean;
  resolveStaff(headers: Headers): Promise<StaffPrincipal | null>;
  rateLimit(
    namespace: string,
    rule: ThrottleRule,
    request: Request,
  ): Promise<RateLimitOutcome>;
  log?: LogSink;
  now?: () => number;
}>;

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** JSON success response. */
export function json(status: number, body: unknown, init?: HeadersInit) {
  const headers = new Headers(init);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

/** Maps a use-case result: failures go to `problem()`, success to `ok`. */
export function toHttp<T>(
  result:
    | Readonly<{ ok: true; value: T }>
    | Readonly<{ ok: false; error: ApplicationError }>,
  map: Readonly<{ ok: (value: T) => Response }>,
): HandlerResult {
  return result.ok ? map.ok(result.value) : result;
}

/** Standard headers on every `/api/v1` response. */
function finish(response: Response, requestId: string) {
  const headers = new Headers(response.headers);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Request-Id", requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

class Refusal {
  constructor(readonly response: Response) {}
}

/**
 * The shared HTTP layer for `/api/v1` (ADR 014, spec 0001). Wrappers own
 * request ids, CSRF, principal resolution, body and query parsing, problem
 * mapping, and logging. Authorization stays in the use case.
 */
export function createRoutes(deps: HttpDependencies) {
  const log = deps.log ?? consoleLogSink;
  const now = deps.now ?? (() => performance.now());

  function refuse(
    code: ProblemCode,
    requestId: string,
    extra: Omit<Parameters<typeof problem>[1], "requestId"> = {},
  ): never {
    throw new Refusal(problem(code, { requestId, ...extra }));
  }

  function fromBody<T>(
    result: Readonly<{ ok: true; value: T }> | BodyFailure,
    requestId: string,
  ): T {
    if (result.ok) return result.value;
    return refuse(result.code, requestId, {
      ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}),
    });
  }

  async function run(
    request: Request,
    context: NextContext | undefined,
    route: string,
    steps: (state: {
      requestId: string;
      params: Params;
      principal: string;
      branchId: string | null;
    }) => Promise<HandlerResult>,
  ): Promise<Response> {
    const started = now();
    const requestId = requestIdFor(request);
    const state = {
      requestId,
      params: {} as Params,
      principal: "public",
      branchId: null as string | null,
    };
    let response: Response;
    try {
      state.params = (await context?.params) ?? {};
      const result = await steps(state);
      if (result instanceof Response) {
        response = result;
      } else if (!result.ok) {
        response = problemFromError(result.error, requestId);
      } else {
        throw new Error(
          "A handler returned a success Result without a Response.",
        );
      }
    } catch (error) {
      if (error instanceof Refusal) {
        response = error.response;
      } else {
        log.error({
          requestId,
          route,
          error: errorName(error),
          stack: stackFrames(error),
        });
        response = problem("INTERNAL", { requestId });
      }
    }
    log.request({
      requestId,
      method: request.method,
      route,
      status: response.status,
      durationMs: Math.round(now() - started),
      principal: state.principal,
      branchId: state.branchId,
    });
    return finish(response, requestId);
  }

  async function input<Body, Query>(
    request: Request,
    options: RouteOptions<Body, Query>,
    requestId: string,
  ) {
    const body = options.body
      ? fromBody(
          validate(
            options.body,
            fromBody(
              await parseJson(request, {
                maxBytes: options.maxBytes ?? DEFAULT_MAX_BODY_BYTES,
              }),
              requestId,
            ),
          ),
          requestId,
        )
      : (undefined as Body);
    const query = options.query
      ? fromBody(
          validate(
            options.query,
            Object.fromEntries(new URL(request.url).searchParams),
            "INVALID_QUERY",
          ),
          requestId,
        )
      : (undefined as Query);
    return { body, query };
  }

  /** No principal. Optional per-client rate limit. */
  function publicRoute<Body = undefined, Query = undefined>(
    options: RouteOptions<Body, Query> &
      Readonly<{ rateLimit?: Readonly<{ name: string; rule: ThrottleRule }> }>,
    handler: (context: BaseContext<Body, Query>) => Promise<HandlerResult>,
  ): RouteHandler {
    return (request, context) =>
      run(request, context, options.route, async (state) => {
        if (options.rateLimit) {
          const outcome = await deps.rateLimit(
            options.rateLimit.name,
            options.rateLimit.rule,
            request,
          );
          if (!outcome.allowed) {
            refuse("RATE_LIMITED", state.requestId, {
              retryAfter: outcome.retryAfterSeconds,
            });
          }
        }
        const { body, query } = await input(request, options, state.requestId);
        return handler({
          request,
          requestId: state.requestId,
          params: state.params,
          body,
          query,
          setBranch: (id) => {
            state.branchId = id;
          },
        });
      });
  }

  /**
   * Cookie-authenticated staff endpoint: CSRF check on unsafe methods, then
   * 401 when signed out, then body and query. Capability and branch checks
   * happen in the use case (`authorize`, `authorizeBranch`).
   */
  function staffRoute<Body = undefined, Query = undefined>(
    options: RouteOptions<Body, Query>,
    handler: (
      context: BaseContext<Body, Query> & Readonly<{ staff: StaffPrincipal }>,
    ) => Promise<HandlerResult>,
  ): RouteHandler {
    return (request, context) =>
      run(request, context, options.route, async (state) => {
        if (UNSAFE_METHODS.has(request.method) && !deps.isSameOrigin(request)) {
          refuse("CROSS_SITE_REQUEST", state.requestId);
        }
        const staff = await deps.resolveStaff(request.headers);
        if (!staff) {
          refuse("UNAUTHENTICATED", state.requestId, {
            detail: "Sign in to continue.",
          });
        }
        state.principal = staff.id;
        const { body, query } = await input(request, options, state.requestId);
        return handler({
          request,
          requestId: state.requestId,
          params: state.params,
          body,
          query,
          staff,
          setBranch: (id) => {
            state.branchId = id;
          },
        });
      });
  }

  /**
   * Provider callbacks (Paymob, M9): no session and no browser CSRF check.
   * The raw body bytes are kept for signature verification.
   */
  function webhookRoute(
    options: Readonly<{ route: string; maxBytes?: number }>,
    handler: (
      context: Readonly<{
        request: Request;
        requestId: string;
        params: Params;
        rawBody: Uint8Array;
        headers: Headers;
      }>,
    ) => Promise<HandlerResult>,
  ): RouteHandler {
    return (request, context) =>
      run(request, context, options.route, async (state) => {
        const rawBody = fromBody(
          await readRawBody(
            request,
            options.maxBytes ?? DEFAULT_MAX_BODY_BYTES,
          ),
          state.requestId,
        );
        return handler({
          request,
          requestId: state.requestId,
          params: state.params,
          rawBody,
          headers: request.headers,
        });
      });
  }

  return { publicRoute, staffRoute, webhookRoute };
}
