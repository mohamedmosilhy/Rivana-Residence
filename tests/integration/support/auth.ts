import type { StaffRole } from "@/domain/shared/types";
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

const NAMES: Record<StaffRole, string> = {
  ADMIN: "Amira Admin",
  EDITOR: "Omar Editor",
  RECEPTIONIST: "Rana Receptionist",
  MANAGER: "Mona Manager",
};

export function provision(
  client: PrismaClient,
  email: string,
  role: StaffRole = "EDITOR",
  options: Readonly<{ branches?: readonly string[] }> = {},
) {
  return createStaff(client, {
    email,
    name: NAMES[role],
    role,
    password: STAFF_PASSWORD,
    ...(options.branches ? { branches: options.branches } : {}),
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
