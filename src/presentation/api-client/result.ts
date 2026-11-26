import type { ApplicationErrorCode } from "@/application/shared/result";

// The shape every API client call answers with (spec 0007, M10-T1).
// Problem codes are listed in docs/api/error-model.md.

/** Codes the HTTP layer answers with before a use case runs. */
type TransportCode =
  | "MALFORMED_JSON"
  | "INVALID_QUERY"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "CROSS_SITE_REQUEST"
  | "INTERNAL";

/** Reported by the client itself, when there is no API answer to describe. */
type ClientCode =
  /** No answer: offline, a dropped connection, or no reply within the limit. */
  | "NETWORK"
  /** An answer that is not the API's, such as a proxy error page. */
  | "UNEXPECTED_RESPONSE"
  /** The caller cancelled the request through its `signal`. */
  | "ABORTED";

export type ApiProblemCode = ApplicationErrorCode | TransportCode | ClientCode;

export type ApiProblem = Readonly<{
  code: ApiProblemCode;
  /** The HTTP status, or null when no answer arrived. */
  status: number | null;
  /** Safe English that may be shown to a guest. */
  title: string;
  detail?: string;
  fieldErrors?: Readonly<Record<string, readonly string[]>>;
  context?: Readonly<Record<string, unknown>>;
  requestId?: string;
  /** Seconds to wait, from `Retry-After`. */
  retryAfter?: number;
}>;

export type ApiSuccess<Status extends number, Data> = Readonly<{
  ok: true;
  status: Status;
  data: Data;
  /** The `ETag` header, sent back as `If-Match` to change a booking. */
  etag?: string;
}>;

export type ApiFailure = Readonly<{ ok: false; problem: ApiProblem }>;

/**
 * Every call resolves to this and never throws. After `NETWORK`,
 * `UNEXPECTED_RESPONSE` or `ABORTED` on a write, the server may or may not
 * have done the work.
 */
export type ApiResult<Success> = Success | ApiFailure;

export type CallOptions = Readonly<{ signal?: AbortSignal }>;
