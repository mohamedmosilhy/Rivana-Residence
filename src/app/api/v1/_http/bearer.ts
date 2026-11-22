/**
 * The token of an `Authorization: Bearer <token>` header, or null. The use
 * case checks the token's format and its hash; this only splits the header,
 * so a malformed header and a wrong token get the same refusal.
 */
export function bearerToken(headers: Headers): string | null {
  const value = headers.get("Authorization");
  if (value === null) return null;
  const match = /^Bearer ([^\s]+)$/i.exec(value.trim());
  return match?.[1] ?? null;
}
