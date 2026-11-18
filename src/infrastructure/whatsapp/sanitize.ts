import "server-only";

export const PROVIDER_DETAIL_MAX = 200;

/** Caps stored and returned provider text (the column is 200 characters). */
export function capDetail(text: string): string {
  return text.length > PROVIDER_DETAIL_MAX
    ? `${text.slice(0, PROVIDER_DETAIL_MAX - 1)}…`
    : text;
}

/**
 * Provider error text made safe to store, return to an Admin, and audit:
 * secrets removed, digit runs of six or more (phone numbers, codes) masked,
 * control characters dropped, and the length capped (spec 0005 Decision 6).
 */
export function sanitizeProviderText(
  text: string,
  secrets: readonly string[] = [],
): string {
  let safe = text;
  for (const secret of secrets) {
    if (secret) safe = safe.split(secret).join("[secret]");
  }
  safe = safe
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    // Separators phone numbers use: spaces, dashes, dots, slashes, brackets.
    .replace(/\+?\(?\d[\d\s().\/-]*\d/g, (run) =>
      run.replace(/\D/g, "").length >= 6 ? "[number]" : run,
    )
    .replace(/\s+/g, " ")
    .trim();
  return capDetail(safe);
}
