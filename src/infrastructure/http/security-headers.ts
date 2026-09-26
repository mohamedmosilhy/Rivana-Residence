// Browser security policy shared by next.config.ts (static headers on every
// response) and the proxy (per-request CSP nonce on rendered pages).

/** Headers safe for every response, including static files and media. */
export const STATIC_SECURITY_HEADERS: readonly Readonly<{
  key: string;
  value: string;
}>[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

/** The only third-party frame: the optional Google Maps embed on Contact. */
const MAP_FRAME_ORIGIN = "https://www.google.com";

export function createNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Scripts run only with this request's nonce (Next applies it to its own
 * scripts); `strict-dynamic` lets those load their chunks. Styles allow
 * inline attributes because server-rendered React and next/image emit
 * `style=""`; that cannot execute script.
 */
export function contentSecurityPolicy(
  input: Readonly<{ nonce: string; development: boolean; https: boolean }>,
) {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${input.nonce}' 'strict-dynamic'${
      input.development ? " 'unsafe-eval'" : ""
    }`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    `frame-src ${MAP_FRAME_ORIGIN}`,
    "media-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(input.https ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
}
