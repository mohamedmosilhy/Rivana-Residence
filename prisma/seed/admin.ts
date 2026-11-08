import { createId } from "@paralleldrive/cuid2";
import { hashPassword } from "better-auth/crypto";

import type { PrismaClient } from "../../src/generated/prisma/client.ts";
import { SEED_ADMIN } from "./admin-credentials.ts";

/**
 * Creates the initial administrator when missing. An existing account is
 * returned untouched: its password is never changed or reset by a re-run.
 */
export async function ensureSeedAdmin(client: PrismaClient, password: string) {
  const existing = await client.user.findUnique({
    where: { email: SEED_ADMIN.email },
  });
  if (existing) return { user: existing, created: false as const };
  const id = createId();
  const user = await client.user.create({
    data: {
      id,
      email: SEED_ADMIN.email,
      name: SEED_ADMIN.name,
      role: "ADMIN",
      active: true,
      emailVerified: true,
      accounts: {
        create: {
          id: createId(),
          providerId: "credential",
          accountId: id,
          password: await hashPassword(password),
        },
      },
    },
  });
  return { user, created: true as const };
}
