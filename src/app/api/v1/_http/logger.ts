// One line per request with an allow list of fields (AC-9). Bodies, cookies,
// tokens, headers, query strings, and raw paths are never logged.

export type RequestLogLine = Readonly<{
  requestId: string;
  method: string;
  /** The route pattern, e.g. `/api/v1/staff/reservations/[id]`. */
  route: string;
  status: number;
  durationMs: number;
  /** Staff user id, or `public`. */
  principal: string;
  branchId: string | null;
}>;

export type ErrorLogLine = Readonly<{
  requestId: string;
  route: string;
  error: string;
  /** Stack frames only; the message line is dropped (it can hold data). */
  stack: readonly string[];
}>;

export type LogSink = Readonly<{
  request(line: RequestLogLine): void;
  error(line: ErrorLogLine): void;
}>;

export const consoleLogSink: LogSink = {
  request: (line) => console.info(JSON.stringify({ event: "http", ...line })),
  error: (line) =>
    console.error(JSON.stringify({ event: "http.error", ...line })),
};

/** The error's frames without its message (driver messages embed values). */
export function stackFrames(error: unknown): readonly string[] {
  if (!(error instanceof Error) || !error.stack) return [];
  return error.stack
    .split("\n")
    .filter((line) => /^\s+at /.test(line))
    .map((line) => line.trim())
    .slice(0, 20);
}

export function errorName(error: unknown) {
  return error instanceof Error ? error.name : typeof error;
}

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

/** Keeps a safe incoming `X-Request-Id`; otherwise generates one. */
export function requestIdFor(request: Request) {
  const incoming = request.headers.get("x-request-id");
  return incoming && SAFE_REQUEST_ID.test(incoming)
    ? incoming
    : crypto.randomUUID();
}
