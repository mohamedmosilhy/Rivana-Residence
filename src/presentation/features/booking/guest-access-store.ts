import type { VerificationChannel } from "./verification-state";

// What lets a guest back to a booking, kept for this tab only (spec 0007,
// AC-13). A key reaches the API in the Authorization header and nowhere else:
// never in a query string, a log, or a website event.

const manageKey = "rivana.access.manage";
const sessionKey = "rivana.access.session";
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export type ManageLink =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "token"; token: string }>;

/**
 * Reads the key of a `#t=` manage link and takes it out of the address bar and
 * of this history entry. Any other fragment, such as the skip link, is left
 * alone.
 */
export function takeManageLink(): ManageLink {
  const { hash, pathname, search } = window.location;
  if (!hash.startsWith("#t=")) return { kind: "none" };
  window.history.replaceState(null, "", `${pathname}${search}`);
  const token = hash.slice(3);
  return tokenPattern.test(token)
    ? { kind: "token", token }
    : { kind: "invalid" };
}

function write(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Blocked storage: the page keeps what it holds in memory.
  }
}

function read(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export const keepManageToken = (token: string) => write(manageKey, token);
export const forgetManageToken = () => write(manageKey, null);

export function readManageToken() {
  const token = read(manageKey);
  return token !== null && tokenPattern.test(token) ? token : null;
}

/** The 30 minute "My reservations" session. */
export type GuestSession = Readonly<{
  token: string;
  channel: VerificationChannel;
  /** On this device's clock. The server decides when the key really ends. */
  expiresAtMs: number;
}>;

export const keepGuestSession = (session: GuestSession) =>
  write(sessionKey, JSON.stringify(session));
export const forgetGuestSession = () => write(sessionKey, null);

export function readGuestSession(nowMs: number): GuestSession | null {
  try {
    const value = JSON.parse(read(sessionKey) ?? "null");
    if (
      typeof value?.token === "string" &&
      tokenPattern.test(value.token) &&
      (value.channel === "WHATSAPP" || value.channel === "EMAIL") &&
      typeof value.expiresAtMs === "number" &&
      value.expiresAtMs > nowMs
    )
      return {
        token: value.token,
        channel: value.channel,
        expiresAtMs: value.expiresAtMs,
      };
  } catch {
    // An unreadable value is treated as no session.
  }
  forgetGuestSession();
  return null;
}
