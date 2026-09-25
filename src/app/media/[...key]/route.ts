import { openPublicMedia } from "@/composition/media";

// Immutable keys: a replaced image always gets a new key, so objects can be
// cached for a year. The strict headers stop a browser from treating an
// image as anything else.
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Disposition": "inline",
};

async function serve(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
  includeBody: boolean,
) {
  const { key } = await params;
  const media = await openPublicMedia(key.join("/"), request, includeBody);

  if (media.status === 404) {
    return new Response("Not found", {
      status: 404,
      headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store" },
    });
  }
  if (media.status === 416) {
    return new Response(null, {
      status: 416,
      headers: {
        ...SECURITY_HEADERS,
        "Content-Range": `bytes */${media.size}`,
      },
    });
  }

  const headers: Record<string, string> = {
    ...SECURITY_HEADERS,
    "Content-Type": media.mimeType,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
    ...(media.etag ? { ETag: media.etag } : {}),
  };
  if (media.status === 304) return new Response(null, { status: 304, headers });
  if (media.range) {
    headers["Content-Range"] =
      `bytes ${media.range.start}-${media.range.end}/${media.size}`;
    headers["Content-Length"] = String(media.range.end - media.range.start + 1);
  } else {
    headers["Content-Length"] = String(media.size);
  }
  return new Response(includeBody ? media.body : null, {
    status: media.status,
    headers,
  });
}

export function GET(
  request: Request,
  context: { params: Promise<{ key: string[] }> },
) {
  return serve(request, context, true);
}

export function HEAD(
  request: Request,
  context: { params: Promise<{ key: string[] }> },
) {
  return serve(request, context, false);
}
