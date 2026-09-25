import { getCurrentStaff } from "@/composition/auth";
import { isSameOriginRequest, mediaLibrary } from "@/composition/media";
import { MEDIA_UPLOAD_POLICY } from "@/domain/media/media-asset";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/**
 * Streams one image upload. The body is the raw file; metadata travels in
 * headers so nothing needs buffering before the size cap applies:
 * `Content-Type`, `Content-Length`, `X-Upload-Filename` (URI-encoded), and
 * `X-Upload-Rights: confirmed`.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return reply(403, { message: "Uploads must come from the admin." });
  }
  const staff = await getCurrentStaff();
  if (!staff) return reply(401, { message: "Sign in to continue." });

  const declaredBytes = Number(request.headers.get("content-length") ?? NaN);
  if (
    Number.isFinite(declaredBytes) &&
    declaredBytes > MEDIA_UPLOAD_POLICY.maxBytes
  ) {
    return reply(413, { message: "Images must be 15 MB or smaller." });
  }
  if (!request.body)
    return reply(400, { message: "Choose an image to upload." });

  let filename: string;
  try {
    filename = decodeURIComponent(
      request.headers.get("x-upload-filename") ?? "",
    );
  } catch {
    return reply(400, { message: "The file name is not valid." });
  }

  const library = await mediaLibrary();
  const result = await library.upload(staff, {
    filename,
    declaredType: (request.headers.get("content-type") ?? "")
      .split(";")[0]!
      .trim(),
    declaredBytes: Number.isFinite(declaredBytes) ? declaredBytes : null,
    source: request.body as unknown as AsyncIterable<Uint8Array>,
    rightsConfirmed: request.headers.get("x-upload-rights") === "confirmed",
  });

  if (result.ok) {
    return reply(201, {
      id: result.value.id,
      storageKey: result.value.storageKey,
      width: result.value.width,
      height: result.value.height,
    });
  }
  const status =
    result.error.code === "FORBIDDEN"
      ? 403
      : result.error.code === "UNAUTHENTICATED"
        ? 401
        : result.error.code === "CONFLICT"
          ? 409
          : 422;
  return reply(status, {
    message: result.error.message,
    duplicateOf: result.error.fieldErrors?.duplicateOf?.[0] ?? null,
  });
}
