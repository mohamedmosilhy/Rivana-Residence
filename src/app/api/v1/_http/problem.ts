import type {
  ApplicationError,
  ApplicationErrorCode,
} from "@/application/shared/result";

/** Errors the HTTP layer produces before a use case runs. */
export type TransportErrorCode =
  | "MALFORMED_JSON"
  | "INVALID_QUERY"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "CROSS_SITE_REQUEST"
  | "INTERNAL";

export type ProblemCode = ApplicationErrorCode | TransportErrorCode;

type ProblemDefinition = Readonly<{ status: number; title: string }>;

/**
 * The single code → status table (docs/api/error-model.md). Titles are fixed,
 * safe English; `detail` carries the use case's own message.
 */
export const PROBLEMS: Readonly<Record<ProblemCode, ProblemDefinition>> = {
  VALIDATION: { status: 422, title: "Some fields need attention" },
  UNAUTHENTICATED: { status: 401, title: "Sign in to continue" },
  INVALID_CREDENTIALS: {
    status: 401,
    title: "The sign-in details are incorrect",
  },
  FORBIDDEN: { status: 403, title: "You do not have access to this" },
  NOT_FOUND: { status: 404, title: "Not found" },
  CONFLICT: { status: 409, title: "This conflicts with the current state" },
  INVENTORY_UNAVAILABLE: {
    status: 409,
    title: "The requested inventory is unavailable",
  },
  SERVICE_UNAVAILABLE: {
    status: 409,
    title: "This service is not available",
  },
  COUPON_INVALID: { status: 422, title: "This coupon cannot be used" },
  REFERENCED: { status: 409, title: "This is still in use" },
  NOT_PUBLISHABLE: { status: 422, title: "This cannot be published yet" },
  RATE_LIMITED: { status: 429, title: "Too many requests" },
  TRY_AGAIN: { status: 503, title: "Please try again shortly" },
  MALFORMED_JSON: { status: 400, title: "The request body is not valid JSON" },
  INVALID_QUERY: { status: 400, title: "The query parameters are not valid" },
  PAYLOAD_TOO_LARGE: { status: 413, title: "The request body is too large" },
  UNSUPPORTED_MEDIA_TYPE: {
    status: 415,
    title: "Send the request body as application/json",
  },
  CROSS_SITE_REQUEST: {
    status: 403,
    title: "Requests must come from this website",
  },
  INTERNAL: { status: 500, title: "Something went wrong" },
};

export const PROBLEM_BASE = "https://rivanaresidence.com/problems/";

export function problemType(code: ProblemCode) {
  return `${PROBLEM_BASE}${code.toLowerCase().replaceAll("_", "-")}`;
}

export type ProblemOptions = Readonly<{
  requestId: string;
  detail?: string;
  fieldErrors?: Readonly<Record<string, readonly string[]>>;
  context?: Readonly<Record<string, unknown>>;
  /** Seconds, for 429 and 503. */
  retryAfter?: number;
}>;

/** Serializes an RFC 9457 problem. The only way `/api/v1` reports errors. */
export function problem(code: ProblemCode, options: ProblemOptions) {
  const { status, title } = PROBLEMS[code];
  const body = {
    type: problemType(code),
    title,
    status,
    code,
    ...(options.detail ? { detail: options.detail } : {}),
    requestId: options.requestId,
    ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}),
    ...(options.context ? { context: options.context } : {}),
  };
  const headers = new Headers({
    "Content-Type": "application/problem+json",
  });
  const retryAfter =
    options.retryAfter ?? (status === 503 ? 5 : status === 429 ? 60 : null);
  if (retryAfter !== null && (status === 429 || status === 503)) {
    headers.set("Retry-After", String(retryAfter));
  }
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Maps a failed application result. Only messages written by use cases and
 * repositories reach `detail`; thrown errors never do.
 */
export function problemFromError(error: ApplicationError, requestId: string) {
  return problem(error.code, {
    requestId,
    detail: error.message,
    ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
    ...(error.context ? { context: error.context } : {}),
  });
}
