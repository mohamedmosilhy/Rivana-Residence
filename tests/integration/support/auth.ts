import type { PrismaClient } from "@/generated/prisma/client";
import { createAuth, type Auth } from "@/infrastructure/auth/better-auth";
import { PrismaStaffDirectory } from "@/infrastructure/db/prisma/repositories/staff-directory";

import { createStaff } from "../../../scripts/staff-admin";

export const TEST_AUTH_SECRET = "integration-test-secret-0123456789abcdef";
export const STAFF_PASSWORD = "Nile-evening-lantern-42";

export function createTestAuth(
  client: PrismaClient,
  options: Partial<{ secureCookies: boolean }> = {},
) {
  const directory = new PrismaStaffDirectory(client);
  const auth = createAuth({
    database: client,
    secret: TEST_AUTH_SECRET,
    baseURL: "http://localhost:3000",
    secureCookies: options.secureCookies ?? false,
    isUserActive: (id) => directory.isActive(id),
    nextCookies: false,
  });
  return { auth, directory };
}

export function provision(
  client: PrismaClient,
  email: string,
  role: "ADMIN" | "EDITOR" = "EDITOR",
) {
  return createStaff(client, {
    email,
    name: role === "ADMIN" ? "Amira Admin" : "Omar Editor",
    role,
    password: STAFF_PASSWORD,
  });
}

/** Signs in through Better Auth and returns the raw Set-Cookie values. */
export async function signIn(
  auth: Auth,
  email: string,
  password = STAFF_PASSWORD,
) {
  const { headers } = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });
  return headers.getSetCookie();
}

export function cookieHeader(setCookies: readonly string[]) {
  return new Headers({
    cookie: setCookies.map((value) => value.split(";")[0]).join("; "),
  });
}
