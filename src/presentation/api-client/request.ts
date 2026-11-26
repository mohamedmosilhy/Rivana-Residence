import { analyticsSessionId } from "./analytics-session";
import type {
  ApiFailure,
  ApiProblem,
  ApiProblemCode,
  ApiResult,
  ApiSuccess,
  CallOptions,
} from "./result";

// The one place the browser sends an API request. Same origin only, never
// cached, never retried, and nothing is logged: bodies and tokens pass through.

export const REQUEST_TIMEOUT_MS = 30_000;

type ApiRequest<Status extends number> = CallOptions &
  Readonly<{
    method: "GET" | "POST";
    /** Segments after `/api/v1`, not yet encoded. */
    path: readonly string[];
    /** The success statuses the endpoint documents. */
    expect: readonly Status[];
    query?: Readonly<Record<string, string | undefined>>;
    body?: unknown;
    /** A manage link or guest session token. */
    bearer?: string;
    headers?: Readonly<Record<string, string>>;
    /** Send the visit id header (P5, P6, P9 and P10). */
    withAnalyticsSession?: boolean;
  }>;

/** A token with spaces or other characters cannot travel in a header. */
const HEADER_SAFE_TOKEN = /^[\x21-\x7E]+$/;

const failed = (problem: ApiProblem): ApiFailure => ({ ok: false, problem });

const noAnswer = () =>
  failed({
    code: "NETWORK",
    status: null,
    title: "We could not reach the website. Check your connection.",
  });

const aborted = () =>
  failed({
    code: "ABORTED",
    status: null,
    title: "The request was cancelled.",
  });

/** Null for a value that cannot be one path segment. */
function encodedSegment(segment: string) {
  // `.` and `..` survive encoding and would address another path.
  if (segment === "" || segment === "." || segment === "..") return null;
  try {
    return encodeURIComponent(segment);
  } catch {
    // Half of a surrogate pair cannot be encoded.
    return null;
  }
}

function urlFor(request: ApiRequest<number>) {
  const segments = request.path.map(encodedSegment);
  if (segments.includes(null)) return null;
  const path = `/api/v1/${segments.join("/")}`;
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(request.query ?? {}))
    if (value !== undefined) query.set(name, value);
  // Not `query.size`: Safari 16.4, a supported browser, does not have it.
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}

function headersFor(request: ApiRequest<number>) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...request.headers,
  };
  if (request.body !== undefined) headers["Content-Type"] = "application/json";
  // Without the header the server gives its own refusal for a bad token.
  if (request.bearer && HEADER_SAFE_TOKEN.test(request.bearer))
    headers.Authorization = `Bearer ${request.bearer}`;
  if (request.withAnalyticsSession) {
    const session = analyticsSessionId();
    if (session) headers["Rivana-Analytics-Session"] = session;
  }
  return headers;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parsed(text: string) {
  try {
    return record(JSON.parse(text));
  } catch {
    return null;
  }
}

function retryAfterOf(headers: Headers) {
  const value = headers.get("Retry-After");
  return value !== null && /^\d+$/.test(value) ? Number(value) : undefined;
}

function problemOf(response: Response, text: string): ApiProblem {
  const body = parsed(text);
  const retryAfter = retryAfterOf(response.headers);
  const wait = retryAfter === undefined ? {} : { retryAfter };
  if (
    response.ok ||
    !body ||
    typeof body.code !== "string" ||
    typeof body.title !== "string"
  )
    return {
      code: "UNEXPECTED_RESPONSE",
      status: response.status,
      title: "Something went wrong. Please try again.",
      ...wait,
    };
  const fieldErrors = record(body.fieldErrors);
  const context = record(body.context);
  return {
    code: body.code as ApiProblemCode,
    status: response.status,
    title: body.title,
    ...(typeof body.detail === "string" ? { detail: body.detail } : {}),
    ...(fieldErrors
      ? { fieldErrors: fieldErrors as Record<string, string[]> }
      : {}),
    ...(context ? { context } : {}),
    ...(typeof body.requestId === "string"
      ? { requestId: body.requestId }
      : {}),
    ...wait,
  };
}

/**
 * Sends one request. The success type is the contract's: bodies are not
 * checked again in the browser (spec 0007, decision 9).
 */
export async function send<Success extends ApiSuccess<number, unknown>>(
  request: ApiRequest<Success["status"]>,
): Promise<ApiResult<Success>> {
  const { signal } = request;
  if (signal?.aborted) return aborted();
  const url = urlFor(request);
  if (url === null)
    return failed({ code: "NOT_FOUND", status: null, title: "Not found" });

  // `AbortSignal.any` is missing from phones that are still in use.
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, REQUEST_TIMEOUT_MS);

  let response: Response;
  let text: string;
  try {
    response = await fetch(url, {
      method: request.method,
      headers: headersFor(request),
      ...(request.body === undefined
        ? {}
        : { body: JSON.stringify(request.body) }),
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      signal: controller.signal,
    });
    text = await response.text();
  } catch {
    return signal?.aborted ? aborted() : noAnswer();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }

  const status = response.status as Success["status"];
  const data = request.expect.includes(status) ? parsed(text) : null;
  if (!data) return failed(problemOf(response, text));
  const etag = response.headers.get("ETag");
  return {
    ok: true,
    status,
    data,
    ...(etag === null ? {} : { etag }),
  } as unknown as Success;
}
