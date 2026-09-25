import { createId } from "@paralleldrive/cuid2";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";

import type { PrismaClient } from "../src/generated/prisma/client.ts";
import { passwordPolicyIssues } from "../src/domain/auth/password-policy.ts";

export class StaffAdminError extends Error {
  override name = "StaffAdminError";
}

const CREDENTIAL_PROVIDER = "credential";
const roleSchema = z.enum(["EDITOR", "ADMIN"]);
const emailSchema = z
  .email()
  .max(320)
  .transform((value) => value.trim().toLowerCase());
const nameSchema = z.string().trim().min(1).max(120);

export type StaffRole = z.infer<typeof roleSchema>;

function parse<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new StaffAdminError(`Invalid ${label}.`);
  return result.data;
}

function assertPassword(
  password: string,
  context: { email: string; name: string },
) {
  const issues = passwordPolicyIssues(password, context);
  if (issues.length > 0) {
    throw new StaffAdminError(`Password rejected: ${issues.join(" ")}`);
  }
}

async function findUser(client: PrismaClient, rawEmail: string) {
  const email = parse(emailSchema, rawEmail, "email");
  const user = await client.user.findUnique({ where: { email } });
  if (!user) throw new StaffAdminError(`No staff account for ${email}.`);
  return user;
}

async function assertAnotherActiveAdmin(client: PrismaClient, userId: string) {
  const others = await client.user.count({
    where: { role: "ADMIN", active: true, id: { not: userId } },
  });
  if (others === 0) {
    throw new StaffAdminError(
      "Refusing: this is the last active administrator.",
    );
  }
}

export async function createStaff(
  client: PrismaClient,
  input: { email: string; name: string; role: string; password: string },
) {
  const email = parse(emailSchema, input.email, "email");
  const name = parse(nameSchema, input.name, "name");
  const role = parse(roleSchema, input.role, "role");
  assertPassword(input.password, { email, name });

  if (await client.user.findUnique({ where: { email } })) {
    throw new StaffAdminError(`A staff account for ${email} already exists.`);
  }

  const password = await hashPassword(input.password);
  const id = createId();
  await client.user.create({
    data: {
      id,
      email,
      name,
      role,
      active: true,
      emailVerified: true,
      accounts: {
        create: {
          id: createId(),
          providerId: CREDENTIAL_PROVIDER,
          accountId: id,
          password,
        },
      },
    },
  });
  return { id, email, name, role };
}

/** Operator password recovery: sets a new password and ends all sessions. */
export async function setStaffPassword(
  client: PrismaClient,
  rawEmail: string,
  newPassword: string,
) {
  const user = await findUser(client, rawEmail);
  assertPassword(newPassword, user);
  const password = await hashPassword(newPassword);

  await client.$transaction(async (transaction) => {
    const credential = await transaction.account.findFirst({
      where: { userId: user.id, providerId: CREDENTIAL_PROVIDER },
    });
    if (credential) {
      await transaction.account.update({
        where: { id: credential.id },
        data: { password },
      });
    } else {
      await transaction.account.create({
        data: {
          id: createId(),
          userId: user.id,
          providerId: CREDENTIAL_PROVIDER,
          accountId: user.id,
          password,
        },
      });
    }
    await transaction.session.deleteMany({ where: { userId: user.id } });
  });
}

export async function setStaffActive(
  client: PrismaClient,
  rawEmail: string,
  active: boolean,
) {
  const user = await findUser(client, rawEmail);
  if (!active && user.role === "ADMIN") {
    await assertAnotherActiveAdmin(client, user.id);
  }
  await client.$transaction([
    client.user.update({ where: { id: user.id }, data: { active } }),
    ...(active
      ? []
      : [client.session.deleteMany({ where: { userId: user.id } })]),
  ]);
}

export async function setStaffRole(
  client: PrismaClient,
  rawEmail: string,
  rawRole: string,
) {
  const user = await findUser(client, rawEmail);
  const role = parse(roleSchema, rawRole, "role");
  if (user.role === "ADMIN" && role !== "ADMIN" && user.active) {
    await assertAnotherActiveAdmin(client, user.id);
  }
  await client.user.update({ where: { id: user.id }, data: { role } });
}

export async function revokeStaffSessions(
  client: PrismaClient,
  rawEmail: string,
) {
  const user = await findUser(client, rawEmail);
  const { count } = await client.session.deleteMany({
    where: { userId: user.id },
  });
  return count;
}

export async function listStaff(client: PrismaClient) {
  const users = await client.user.findMany({
    orderBy: { email: "asc" },
    select: {
      email: true,
      name: true,
      role: true,
      active: true,
      _count: { select: { sessions: true } },
    },
  });
  return users.map(({ _count, ...user }) => ({
    ...user,
    sessions: _count.sessions,
  }));
}
