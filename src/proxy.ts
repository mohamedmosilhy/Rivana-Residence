import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { loginPathFor } from "@/application/auth/return-path";
import { AUTH_COOKIE_PREFIX } from "@/infrastructure/auth/cookie-config";

const LOGIN_PATH = "/admin/login";

// Optimistic only: a missing cookie redirects early to spare a render. Every
// admin page and Server Action still performs the authoritative database
// session and role check.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isLogin = pathname === LOGIN_PATH;
  const hasSessionCookie = Boolean(
    getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX }),
  );

  const response =
    !isLogin && !hasSessionCookie
      ? NextResponse.redirect(
          new URL(loginPathFor(`${pathname}${search}`), request.url),
        )
      : NextResponse.next();

  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
