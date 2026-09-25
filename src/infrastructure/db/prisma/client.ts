import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnv } from "@/lib/env/server";

type PrismaGlobal = typeof globalThis & {
  rivanaPrisma?: PrismaClient;
};

function createPrismaClient() {
  const { DATABASE_URL } = getServerEnv();
  if (!DATABASE_URL) {
    throw new Error(
      "Invalid server environment:\nDATABASE_URL: A PostgreSQL connection URL is required to use persistence.",
    );
  }

  const adapter = new PrismaPg({ connectionString: DATABASE_URL });
  return new PrismaClient({ adapter });
}

const prismaGlobal = globalThis as PrismaGlobal;

export function getPrisma() {
  const client = prismaGlobal.rivanaPrisma ?? createPrismaClient();
  prismaGlobal.rivanaPrisma = client;
  return client;
}
