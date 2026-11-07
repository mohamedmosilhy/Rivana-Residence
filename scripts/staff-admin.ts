import { createId } from "@paralleldrive/cuid2";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";

import type { Prisma, PrismaClient } from "../src/generated/prisma/client.ts";
import {
  auditEvent,
  type AuditAction,
  type AuditChanges,
} from "../src/domain/audit/index.ts";
import { isBranchScopedRole } from "../src/domain/auth/capabilities.ts";
import { passwordPolicyIssues } from "../src/domain/auth/password-policy.ts";
import { STAFF_ROLES } from "../src/domain/shared/types.ts";

export class StaffAdminError extends Error {
  override name = "StaffAdminError";
}

const CREDENTIAL_PROVIDER = "credential";
const roleSchema = z.enum(STAFF_ROLES);
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

type Transaction = Prisma.TransactionClient;

// The CLI is the operator, so its audit rows have actor SYSTEM (spec 0001).
async function appendAudit<A extends AuditAction>(
  transaction: Transaction,
  action: A,
  userId: string,
  changes: AuditChanges[A],
  branchId: string | null = null,
) {
  const event = auditEvent({
    occurredAt: new Date(),
    actorType: "SYSTEM",
    actorId: null,
    action,
    entityType: "User",
    entityId: userId,
    branchId,
    reason: null,
    changes,
  });
  await transaction.auditEvent.create({
    data: {
      id: createId(),
      ...event,
      changes: event.changes as Prisma.InputJsonObject,
    },
  });
}

function assertBranchScoped(role: string, email: string) {
  if (!isBranchScopedRole(role as (typeof STAFF_ROLES)[number])) {
    throw new StaffAdminError(
      `Refusing: ${email} is ${role === "ADMIN" ? "an administrator (all branches)" : "an editor (no branch scope)"}; only receptionists and managers are assigned to branches.`,
    );
  }
}

async function findBranch(client: PrismaClient | Transaction, slug: string) {
  const branch = await client.branch.findUnique({
    where: { slug: slug.trim().toLowerCase() },
    select: { id: true, slug: true },
  });
  if (!branch) throw new StaffAdminError(`No branch with the slug "${slug}".`);
  return branch;
}

export async function createStaff(
  client: PrismaClient,
  input: {
    email: string;
    name: string;
    role: string;
    password: string;
    /** Branch slugs, for receptionists and managers only. */
    branches?: readonly string[];
  },
) {
  const email = parse(emailSchema, input.email, "email");
  const name = parse(nameSchema, input.name, "name");
  const role = parse(roleSchema, input.role, "role");
  const branchSlugs = [...new Set(input.branches ?? [])];
  if (branchSlugs.length > 0) assertBranchScoped(role, email);
  assertPassword(input.password, { email, name });

  if (await client.user.findUnique({ where: { email } })) {
    throw new StaffAdminError(`A staff account for ${email} already exists.`);
  }
  const branches = await Promise.all(
    branchSlugs.map((slug) => findBranch(client, slug)),
  );

  const password = await hashPassword(input.password);
  const id = createId();
  await client.$transaction(async (transaction) => {
    await transaction.user.create({
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
    for (const branch of branches) {
      await transaction.staffBranchAssignment.create({
        data: { userId: id, branchId: branch.id },
      });
      await appendAudit(
        transaction,
        "staff.branch-assigned",
        id,
        { branchId: branch.id },
        branch.id,
      );
    }
  });
  return { id, email, name, role, branches: branches.map((b) => b.slug) };
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
  if (role === user.role) return;
  await client.$transaction(async (transaction) => {
    await transaction.user.update({ where: { id: user.id }, data: { role } });
    await appendAudit(transaction, "staff.role-changed", user.id, {
      role: { from: user.role, to: role },
    });
    // Admins are implicitly all-branch and Editors have no branch scope, so
    // their assignment rows would be meaningless (ADR 018).
    if (!isBranchScopedRole(role)) {
      const assignments = await transaction.staffBranchAssignment.findMany({
        where: { userId: user.id },
        select: { branchId: true },
      });
      await transaction.staffBranchAssignment.deleteMany({
        where: { userId: user.id },
      });
      for (const { branchId } of assignments) {
        await appendAudit(
          transaction,
          "staff.branch-unassigned",
          user.id,
          { branchId },
          branchId,
        );
      }
    }
  });
}

/** Idempotent. Returns false when the assignment already existed. */
export async function assignStaffBranch(
  client: PrismaClient,
  rawEmail: string,
  slug: string,
) {
  const user = await findUser(client, rawEmail);
  assertBranchScoped(user.role, user.email);
  const branch = await findBranch(client, slug);
  return client.$transaction(async (transaction) => {
    const key = { userId_branchId: { userId: user.id, branchId: branch.id } };
    if (await transaction.staffBranchAssignment.findUnique({ where: key })) {
      return false;
    }
    await transaction.staffBranchAssignment.create({
      data: { userId: user.id, branchId: branch.id },
    });
    await appendAudit(
      transaction,
      "staff.branch-assigned",
      user.id,
      { branchId: branch.id },
      branch.id,
    );
    return true;
  });
}

/** Idempotent. Returns false when there was no such assignment. */
export async function unassignStaffBranch(
  client: PrismaClient,
  rawEmail: string,
  slug: string,
) {
  const user = await findUser(client, rawEmail);
  assertBranchScoped(user.role, user.email);
  const branch = await findBranch(client, slug);
  return client.$transaction(async (transaction) => {
    const { count } = await transaction.staffBranchAssignment.deleteMany({
      where: { userId: user.id, branchId: branch.id },
    });
    if (count === 0) return false;
    await appendAudit(
      transaction,
      "staff.branch-unassigned",
      user.id,
      { branchId: branch.id },
      branch.id,
    );
    return true;
  });
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
      branchAssignments: {
        select: { branch: { select: { slug: true } } },
        orderBy: { branch: { slug: "asc" } },
      },
    },
  });
  return users.map(({ _count, branchAssignments, ...user }) => ({
    ...user,
    branches:
      user.role === "ADMIN"
        ? "all"
        : isBranchScopedRole(user.role)
          ? branchAssignments.map(({ branch }) => branch.slug).join(", ") ||
            "none"
          : "-",
    sessions: _count.sessions,
  }));
}
