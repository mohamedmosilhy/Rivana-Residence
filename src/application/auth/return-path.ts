const ADMIN_HOME = "/admin";
const LOGIN_PATH = "/admin/login";
const BASE = "https://return-path.invalid";

// Accepts only same-origin admin paths. Anything else (absolute URLs,
// protocol-relative "//host", backslash tricks, encoded separators, or the
// login page itself) falls back to the admin home.
export function safeReturnPath(candidate: unknown): string {
  if (typeof candidate !== "string" || candidate.length > 512) {
    return ADMIN_HOME;
  }
  if (!candidate.startsWith("/") || /[\\\u0000-\u001f]/.test(candidate)) {
    return ADMIN_HOME;
  }
  if (candidate.startsWith("//") || /%2f|%5c/i.test(candidate)) {
    return ADMIN_HOME;
  }

  let url: URL;
  try {
    url = new URL(candidate, BASE);
  } catch {
    return ADMIN_HOME;
  }
  if (url.origin !== BASE) return ADMIN_HOME;

  const { pathname, search } = url;
  const isAdmin =
    pathname === ADMIN_HOME || pathname.startsWith(`${ADMIN_HOME}/`);
  const isLogin =
    pathname === LOGIN_PATH || pathname.startsWith(`${LOGIN_PATH}/`);
  if (!isAdmin || isLogin) return ADMIN_HOME;

  return `${pathname}${search}`;
}

export function loginPathFor(returnTo: string) {
  const safe = safeReturnPath(returnTo);
  return safe === ADMIN_HOME
    ? LOGIN_PATH
    : `${LOGIN_PATH}?returnTo=${encodeURIComponent(safe)}`;
}
