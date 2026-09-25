import { isAPIError } from "better-auth/api";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { BetterAuthCredentialAuthenticator } from "@/infrastructure/auth/credential-authenticator";
import { resolveStaffSession } from "@/infrastructure/auth/staff-session";

import {
  StaffAdminError,
  setStaffActive,
  setStaffPassword,
  setStaffRole,
} from "../../scripts/staff-admin";
import {
  STAFF_PASSWORD,
  cookieHeader,
  createTestAuth,
  provision,
  signIn,
} from "./support/auth";
import { createTestClient, resetDatabase } from "./support/database";

const client = createTestClient();
const { auth, directory } = createTestAuth(client);
const authenticator = new BetterAuthCredentialAuthenticator(
  auth,
  async () => new Headers(),
);

afterAll(() => client.$disconnect());
beforeEach(() => resetDatabase(client));

const resolve = (setCookies: readonly string[]) =>
  resolveStaffSession(auth, directory, cookieHeader(setCookies));

describe("closed registration", () => {
  it("rejects public sign-up", async () => {
    await expect(
      auth.api.signUpEmail({
        body: {
          email: "stranger@example.test",
          password: STAFF_PASSWORD,
          name: "Stranger",
        },
      }),
    ).rejects.toSatisfy(isAPIError);
    expect(await client.user.count()).toBe(0);
  });

  it("ignores role and active fields supplied through the auth API", async () => {
    const staff = await provision(client, "editor@example.test");
    const cookies = await signIn(auth, staff.email);

    await expect(
      auth.api.updateUser({
        body: { role: "ADMIN" } as never,
        headers: cookieHeader(cookies),
      }),
    ).rejects.toSatisfy(isAPIError);
    expect((await directory.findById(staff.id))?.role).toBe("EDITOR");
  });
});

describe("sessions", () => {
  it("creates a database session and resolves the staff principal", async () => {
    const staff = await provision(client, "Admin@Example.test", "ADMIN");

    const principal = await resolve(await signIn(auth, "admin@example.test"));

    expect(principal).toEqual({
      id: staff.id,
      name: "Amira Admin",
      email: "admin@example.test",
      role: "ADMIN",
      sessionId: expect.any(String),
    });
    expect(await client.session.count({ where: { userId: staff.id } })).toBe(1);
  });

  it("stores only a password hash", async () => {
    const staff = await provision(client, "editor@example.test");
    const account = await client.account.findFirstOrThrow({
      where: { userId: staff.id },
    });

    expect(account.providerId).toBe("credential");
    expect(account.password).not.toContain(STAFF_PASSWORD);
    expect(account.password?.length).toBeGreaterThan(60);
  });

  it("sets an HttpOnly, SameSite=Lax, admin-scoped, host-only cookie", async () => {
    await provision(client, "editor@example.test");
    const [session] = (await signIn(auth, "editor@example.test")).filter((c) =>
      c.startsWith("rivana.session_token="),
    );

    expect(session).toMatch(/; HttpOnly/i);
    expect(session).toMatch(/; SameSite=Lax/i);
    expect(session).toMatch(/; Path=\/admin/i);
    expect(session).not.toMatch(/; Domain=/i);
    expect(session).not.toMatch(/; Secure/i);
  });

  it("uses the __Secure- prefix and Secure flag in production mode", async () => {
    const secure = createTestAuth(client, { secureCookies: true });
    await provision(client, "editor@example.test");

    const cookies = await signIn(secure.auth, "editor@example.test");

    expect(cookies.join("\n")).toMatch(
      /^__Secure-rivana\.session_token=.*; Secure/im,
    );
  });

  it("rejects expired sessions", async () => {
    await provision(client, "editor@example.test");
    const cookies = await signIn(auth, "editor@example.test");
    await client.session.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await resolve(cookies)).toBeNull();
  });

  it("rejects tampered and unknown session tokens", async () => {
    await provision(client, "editor@example.test");
    const cookies = await signIn(auth, "editor@example.test");
    const tampered = cookies.map((cookie) =>
      cookie.replace(/session_token=([^.;]+)/, "session_token=forged"),
    );

    expect(await resolve(tampered)).toBeNull();
    expect(await resolve([])).toBeNull();
  });

  it("signs out by deleting the session", async () => {
    await provision(client, "editor@example.test");
    const cookies = await signIn(auth, "editor@example.test");

    await auth.api.signOut({ headers: cookieHeader(cookies) });

    expect(await client.session.count()).toBe(0);
    expect(await resolve(cookies)).toBeNull();
  });

  it("revokes other sessions while keeping the current one", async () => {
    const staff = await provision(client, "editor@example.test");
    const first = await signIn(auth, staff.email);
    const second = await signIn(auth, staff.email);
    const current = await resolve(first);

    expect(
      await directory.revokeSessions(staff.id, { except: current!.sessionId }),
    ).toBe(1);
    expect(await resolve(first)).not.toBeNull();
    expect(await resolve(second)).toBeNull();
  });

  it("lists only live sessions and marks the current one", async () => {
    const staff = await provision(client, "editor@example.test");
    const cookies = await signIn(auth, staff.email);
    await signIn(auth, staff.email);
    const current = await resolve(cookies);

    const sessions = await directory.listSessions(
      staff.id,
      current!.sessionId,
      new Date(),
    );

    expect(sessions).toHaveLength(2);
    expect(sessions.filter((session) => session.current)).toHaveLength(1);
    expect(Object.keys(sessions[0]!)).not.toContain("token");
  });
});

describe("account state and roles", () => {
  it("blocks sign-in for inactive users without creating a session", async () => {
    await provision(client, "admin@example.test", "ADMIN");
    await provision(client, "editor@example.test");
    await setStaffActive(client, "editor@example.test", false);

    expect(
      await authenticator.signIn("editor@example.test", STAFF_PASSWORD),
    ).toBe(false);
    expect(await client.session.count()).toBe(0);
  });

  it("ends existing sessions when a user is deactivated", async () => {
    await provision(client, "admin@example.test", "ADMIN");
    await provision(client, "editor@example.test");
    const cookies = await signIn(auth, "editor@example.test");

    await setStaffActive(client, "editor@example.test", false);

    expect(await resolve(cookies)).toBeNull();
  });

  it("denies and cleans up sessions if a user is deactivated out of band", async () => {
    const staff = await provision(client, "editor@example.test");
    const cookies = await signIn(auth, staff.email);
    await client.user.update({
      where: { id: staff.id },
      data: { active: false },
    });

    expect(await resolve(cookies)).toBeNull();
    expect(await client.session.count()).toBe(0);
  });

  it("applies role changes on the next request", async () => {
    await provision(client, "admin@example.test", "ADMIN");
    await provision(client, "editor@example.test");
    const cookies = await signIn(auth, "editor@example.test");

    await setStaffRole(client, "editor@example.test", "ADMIN");

    expect((await resolve(cookies))?.role).toBe("ADMIN");
  });

  it("refuses to deactivate or demote the last active administrator", async () => {
    await provision(client, "admin@example.test", "ADMIN");

    await expect(
      setStaffActive(client, "admin@example.test", false),
    ).rejects.toBeInstanceOf(StaffAdminError);
    await expect(
      setStaffRole(client, "admin@example.test", "EDITOR"),
    ).rejects.toBeInstanceOf(StaffAdminError);
  });
});

describe("credentials", () => {
  it("fails identically for unknown email and wrong password", async () => {
    await provision(client, "editor@example.test");

    const errors = await Promise.all(
      [
        ["nobody@example.test", STAFF_PASSWORD],
        ["editor@example.test", "wrong-password-value"],
      ].map(([email, password]) =>
        auth.api
          .signInEmail({ body: { email: email!, password: password! } })
          .then(
            () => null,
            (error: unknown) =>
              isAPIError(error) ? [error.status, error.body?.code] : error,
          ),
      ),
    );

    expect(errors[0]).toEqual(errors[1]);
    expect(errors[0]).toEqual(["UNAUTHORIZED", "INVALID_EMAIL_OR_PASSWORD"]);
  });

  it("operator password reset ends sessions and replaces the password", async () => {
    await provision(client, "editor@example.test");
    const cookies = await signIn(auth, "editor@example.test");

    await setStaffPassword(
      client,
      "editor@example.test",
      "Granite-harbour-sunrise-7",
    );

    expect(await resolve(cookies)).toBeNull();
    expect(
      await authenticator.signIn("editor@example.test", STAFF_PASSWORD),
    ).toBe(false);
    expect(
      await authenticator.signIn(
        "editor@example.test",
        "Granite-harbour-sunrise-7",
      ),
    ).toBe(true);
  });

  it("changing a password revokes the user's other sessions", async () => {
    await provision(client, "editor@example.test");
    const current = await signIn(auth, "editor@example.test");
    const other = await signIn(auth, "editor@example.test");

    await auth.api.changePassword({
      body: {
        currentPassword: STAFF_PASSWORD,
        newPassword: "Granite-harbour-sunrise-7",
        revokeOtherSessions: true,
      },
      headers: cookieHeader(current),
    });

    expect(await resolve(other)).toBeNull();
  });

  it("rejects weak passwords at provisioning", async () => {
    await expect(provisionWithPassword("short")).rejects.toThrow(
      /at least 12 characters/,
    );
    await expect(provisionWithPassword("password1234")).rejects.toThrow(
      /less common/,
    );
  });
});

async function provisionWithPassword(password: string) {
  const { createStaff } = await import("../../scripts/staff-admin");
  return createStaff(client, {
    email: "weak@example.test",
    name: "Weak Password",
    role: "EDITOR",
    password,
  });
}
