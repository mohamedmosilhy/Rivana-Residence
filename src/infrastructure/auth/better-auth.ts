import "server-only";

import { createId } from "@paralleldrive/cuid2";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

import {
  AUTH_COOKIE_PATH,
  AUTH_COOKIE_PREFIX,
} from "@/infrastructure/auth/cookie-config";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/domain/auth/password-policy";

export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
export const SESSION_REFRESH_AGE_SECONDS = 60 * 60;

export type AuthOptions = Readonly<{
  database: Parameters<typeof prismaAdapter>[0];
  secret: string;
  baseURL: string;
  secureCookies: boolean;
  isUserActive(userId: string): Promise<boolean>;
  /** Writes Set-Cookie through `next/headers`; off for non-Next callers. */
  nextCookies?: boolean;
}>;

export function createAuth(options: AuthOptions) {
  return betterAuth({
    appName: "Rivana Residence",
    baseURL: options.baseURL,
    basePath: "/api/auth",
    secret: options.secret,
    trustedOrigins: [new URL(options.baseURL).origin],
    database: prismaAdapter(options.database, {
      provider: "postgresql",
      transaction: true,
    }),
    emailAndPassword: {
      enabled: true,
      // Staff accounts are provisioned by an administrator only.
      disableSignUp: true,
      autoSignIn: false,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      revokeSessionsOnPasswordReset: true,
    },
    user: {
      additionalFields: {
        role: { type: ["EDITOR", "ADMIN"], input: false, required: false },
        active: { type: "boolean", input: false, required: false },
      },
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
    },
    account: { accountLinking: { enabled: false } },
    session: {
      expiresIn: SESSION_MAX_AGE_SECONDS,
      updateAge: SESSION_REFRESH_AGE_SECONDS,
      freshAge: 15 * 60,
      // Every request reads the database session so revocation and
      // deactivation take effect immediately.
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, storage: "memory", window: 60, max: 30 },
    advanced: {
      cookiePrefix: AUTH_COOKIE_PREFIX,
      useSecureCookies: options.secureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        // Scoped to the admin so public pages never receive the cookie.
        path: AUTH_COOKIE_PATH,
      },
      ipAddress: { disableIpTracking: true },
      database: { generateId: () => createId() },
    },
    databaseHooks: {
      session: {
        create: {
          // Runs after the password check, so inactive accounts fail the
          // same way (and with the same timing) as a wrong password.
          async before(session) {
            if (!(await options.isUserActive(session.userId))) return false;
          },
        },
      },
    },
    telemetry: { enabled: false },
    plugins: options.nextCookies === false ? [] : [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
