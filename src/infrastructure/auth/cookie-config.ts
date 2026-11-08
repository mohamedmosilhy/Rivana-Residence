// Shared by the Better Auth configuration and the proxy, which must not load
// server-only modules.
// A new name avoids collisions with the older /admin-only session cookie.
// Staff sign in again when upgrading to the shared admin/API session.
export const AUTH_COOKIE_PREFIX = "rivana-staff";
export const AUTH_COOKIE_PATH = "/";
