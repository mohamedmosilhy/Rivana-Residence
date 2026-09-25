import "server-only";

import { isAPIError } from "better-auth/api";
import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { authorize } from "@/application/auth/authorize";
import type { StaffPrincipal } from "@/application/auth/ports";
import { loginPathFor } from "@/application/auth/return-path";
import { SignIn } from "@/application/auth/sign-in";
import { failure, success, type Result } from "@/application/shared/result";
import { roleHasCapability, type Capability } from "@/domain/auth/capabilities";
import { passwordPolicyIssues } from "@/domain/auth/password-policy";
import { createAuth, type Auth } from "@/infrastructure/auth/better-auth";
import { BetterAuthCredentialAuthenticator } from "@/infrastructure/auth/credential-authenticator";
import { resolveStaffSession } from "@/infrastructure/auth/staff-session";
import { HmacThrottleKeys } from "@/infrastructure/auth/throttle-keys";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaLoginThrottleStore } from "@/infrastructure/db/prisma/repositories/login-throttle-store";
import { PrismaStaffDirectory } from "@/infrastructure/db/prisma/repositories/staff-directory";
import { getServerEnv } from "@/lib/env/server";

type AuthRuntime = Readonly<{
  auth: Auth;
  directory: PrismaStaffDirectory;
  secret: string;
  trustProxyHeaders: boolean;
}>;

let runtime: AuthRuntime | undefined;

function getRuntime(): AuthRuntime {
  if (runtime) return runtime;
  const env = getServerEnv();
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error(
      "Invalid server environment:\nBETTER_AUTH_SECRET: Required to use admin authentication.",
    );
  }
  const directory = new PrismaStaffDirectory(getPrisma());
  runtime = {
    auth: createAuth({
      database: getPrisma(),
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.APP_URL,
      secureCookies: env.NODE_ENV === "production",
      isUserActive: (id) => directory.isActive(id),
    }),
    directory,
    secret: env.BETTER_AUTH_SECRET,
    trustProxyHeaders: env.AUTH_TRUST_PROXY_HEADERS,
  };
  return runtime;
}

const clock = { now: () => new Date() };

/** The signed-in, active staff member for this request, or null. */
export const getCurrentStaff = cache(
  async (): Promise<StaffPrincipal | null> => {
    // Reading request headers first marks the route dynamic, so admin pages
    // are never prerendered at build time.
    const requestHeaders = await headers();
    const { auth, directory } = getRuntime();
    return resolveStaffSession(auth, directory, requestHeaders);
  },
);

export type PageAccess = Readonly<{ staff: StaffPrincipal; allowed: boolean }>;

/**
 * Page-level guard. Redirects to login when signed out; reports whether the
 * signed-in role holds the capability so the page can render a denial.
 */
export async function requireStaff(
  currentPath: string,
  capability: Capability = "admin:access",
): Promise<PageAccess> {
  const staff = await getCurrentStaff();
  if (!staff) redirect(loginPathFor(currentPath) as Route);
  return { staff, allowed: roleHasCapability(staff.role, capability) };
}

/** Mutation guard for Server Actions: re-checks the session and role. */
export async function authorizeAction(
  capability: Capability,
): Promise<Result<StaffPrincipal>> {
  return authorize(await getCurrentStaff(), capability);
}

async function clientAddress(trustProxyHeaders: boolean) {
  if (!trustProxyHeaders) return null;
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0];
  return (forwarded ?? requestHeaders.get("x-real-ip"))?.trim() || null;
}

export async function signInWithPassword(email: unknown, password: unknown) {
  const { auth, secret, trustProxyHeaders } = getRuntime();
  const useCase = new SignIn(
    new BetterAuthCredentialAuthenticator(auth, headers),
    new PrismaLoginThrottleStore(getPrisma()),
    new HmacThrottleKeys(secret),
    clock,
  );
  return useCase.execute({
    email,
    password,
    clientAddress: await clientAddress(trustProxyHeaders),
  });
}

export async function signOutCurrentSession() {
  const { auth } = getRuntime();
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch (error) {
    if (!isAPIError(error)) throw error;
  }
}

export async function listOwnSessions() {
  const access = await authorizeAction("sessions:manage-own");
  if (!access.ok) return access;
  const { directory } = getRuntime();
  return success(
    await directory.listSessions(
      access.value.id,
      access.value.sessionId,
      clock.now(),
    ),
  );
}

export async function listStaffAccounts() {
  const access = await authorizeAction("users:manage");
  if (!access.ok) return access;
  return success(await getRuntime().directory.listAccounts(clock.now()));
}

export async function revokeOwnOtherSessions(): Promise<Result<number>> {
  const access = await authorizeAction("sessions:manage-own");
  if (!access.ok) return access;
  const { directory } = getRuntime();
  return success(
    await directory.revokeSessions(access.value.id, {
      except: access.value.sessionId,
    }),
  );
}

export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
): Promise<Result<void>> {
  const access = await authorizeAction("sessions:manage-own");
  if (!access.ok) return access;

  const issues = passwordPolicyIssues(newPassword, access.value);
  if (issues.length > 0) {
    return failure("VALIDATION", "Choose a stronger password.", {
      newPassword: issues,
    });
  }

  const { auth } = getRuntime();
  try {
    await auth.api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: true },
      headers: await headers(),
    });
    return success(undefined);
  } catch (error) {
    if (!isAPIError(error)) throw error;
    return failure("VALIDATION", "The current password is incorrect.", {
      currentPassword: ["The current password is incorrect."],
    });
  }
}
