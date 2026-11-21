/**
 * Reads the reservation version from `If-Match`. The `ETag` we send is
 * `"v<version>"`; the quotes and a weak prefix are tolerated. Anything else
 * is "no version", which the use case answers with 428.
 */
export function ifMatchVersion(request: Request): number | null {
  const header = request.headers.get("If-Match");
  const match = header?.trim().match(/^(?:W\/)?"?v(\d{1,10})"?$/);
  if (!match) return null;
  const version = Number(match[1]);
  // "v0" is well formed but never current: it gets 412, not 428.
  return Number.isSafeInteger(version) ? version : null;
}
