import "server-only";

import { getServerEnv } from "@/lib/env/server";

/**
 * CSRF defence for cookie-authenticated requests that Next's Server Action
 * checks do not cover (the media upload route and `/api/v1` staff
 * mutations): the browser must say the request comes from this site's own
 * origin. A missing Origin is refused.
 */
export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  if (!origin) return false;
  return origin === new URL(getServerEnv().APP_URL).origin;
}

/**
 * The client address for rate limits, from proxy headers only when the
 * deployment trusts them (the same rule as sign-in throttling).
 */
export function clientAddressFrom(headers: Headers) {
  if (!getServerEnv().AUTH_TRUST_PROXY_HEADERS) return null;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0];
  return (forwarded ?? headers.get("x-real-ip"))?.trim() || null;
}
