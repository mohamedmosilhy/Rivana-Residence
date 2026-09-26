import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { loginPathFor } from "@/application/auth/return-path";
import { AUTH_COOKIE_PREFIX } from "@/infrastructure/auth/cookie-config";
import {
  contentSecurityPolicy,
  createNonce,
} from "@/infrastructure/http/security-headers";

const LOGIN_PATH = "/admin/login";

function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const csp = contentSecurityPolicy({
    nonce: createNonce(),
    development: process.env.NODE_ENV === "development",
    https: (process.env.APP_URL ?? "").startsWith("https:"),
  });

  // Optimistic only: a missing cookie redirects early to spare a render.
  // Every admin page and Server Action still performs the authoritative
  // database session and role check.
  if (
    isAdminPath(pathname) &&
    pathname !== LOGIN_PATH &&
    !getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX })
  ) {
    return adminHeaders(
      NextResponse.redirect(
        new URL(loginPathFor(`${pathname}${search}`), request.url),
      ),
    );
  }

  // Next reads the nonce from the request's CSP header and applies it to
  // the scripts it renders; the browser enforces the response header.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return isAdminPath(pathname) ? adminHeaders(response) : response;
}

function adminHeaders(response: NextResponse) {
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  // Rendered pages only. Static files, optimized images, and the media route
  // (which sends its own sandbox policy) need no nonce.
  matcher: [
    "/((?!_next/static|_next/image|media/|robots\\.txt|sitemap\\.xml|rivana-icon\\.png|apple-icon\\.png|favicon\\.ico).*)",
  ],
};
