import type { z } from "zod";

import type { ProblemCode } from "./problem";

/** Default cap for JSON bodies (docs/api/rest-api-conventions.md). */
export const DEFAULT_MAX_BODY_BYTES = 32 * 1024;

export type BodyFailure = Readonly<{
  ok: false;
  code: ProblemCode;
  fieldErrors?: Readonly<Record<string, readonly string[]>>;
}>;

export type BodyResult<T> = Readonly<{ ok: true; value: T }> | BodyFailure;

const JSON_TYPE = /^application\/json\s*(;.*)?$/i;

/**
 * Reads the raw body, refusing a declared or actual size over `maxBytes`.
 * The stream is counted, so a missing or false Content-Length cannot get a
 * larger body through.
 */
export async function readRawBody(
  request: Request,
  maxBytes: number,
): Promise<BodyResult<Uint8Array>> {
  const declared = Number(request.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, code: "PAYLOAD_TOO_LARGE" };
  }
  if (!request.body) return { ok: true, value: new Uint8Array() };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return { ok: false, code: "PAYLOAD_TOO_LARGE" };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, value: bytes };
}

/**
 * `parseJson(request, { maxBytes })`: 415 for a non-JSON content type
 * (checked before reading), 413 over the cap, 400 for invalid UTF-8 or JSON.
 */
export async function parseJson(
  request: Request,
  options: Readonly<{ maxBytes?: number }> = {},
): Promise<BodyResult<unknown>> {
  if (!JSON_TYPE.test(request.headers.get("content-type") ?? "")) {
    return { ok: false, code: "UNSUPPORTED_MEDIA_TYPE" };
  }
  const raw = await readRawBody(
    request,
    options.maxBytes ?? DEFAULT_MAX_BODY_BYTES,
  );
  if (!raw.ok) return raw;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(raw.value);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, code: "MALFORMED_JSON" };
  }
}

/**
 * Groups Zod issues by dotted path (`guest.email`; `_root` for the whole
 * value). Unknown keys from `.strict()` schemas are reported on the key
 * itself. Messages describe the rule and never echo the submitted value.
 */
export function fieldErrorsFrom(issues: readonly z.core.$ZodIssue[]) {
  const fieldErrors: Record<string, string[]> = {};
  const add = (path: readonly PropertyKey[], message: string) => {
    const key = path.length > 0 ? path.map(String).join(".") : "_root";
    (fieldErrors[key] ??= []).push(message);
  };
  for (const issue of issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) add([...issue.path, key], "Unknown field.");
    } else {
      add(issue.path, issue.message);
    }
  }
  return fieldErrors;
}

/** `validate(schema, value)`: failures become 422 VALIDATION. */
export function validate<T>(
  schema: z.ZodType<T>,
  value: unknown,
  code: "VALIDATION" | "INVALID_QUERY" = "VALIDATION",
): BodyResult<T> {
  const parsed = schema.safeParse(value);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, code, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
}
