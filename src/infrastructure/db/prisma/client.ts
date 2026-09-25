import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnv } from "@/lib/env/server";

export const UTC_SESSION = "-c TimeZone=UTC";

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

  // The pg adapter sends and reads timestamps as zone-less UTC wall time, so
  // the session must run in UTC. Otherwise a server whose default zone is,
  // say, Africa/Cairo stores every Prisma-written instant hours off.
  const adapter = new PrismaPg({
    connectionString: DATABASE_URL,
    options: UTC_SESSION,
  });
  return new PrismaClient({ adapter });
}

const prismaGlobal = globalThis as PrismaGlobal;

export function getPrisma() {
  const client = prismaGlobal.rivanaPrisma ?? createPrismaClient();
  prismaGlobal.rivanaPrisma = client;
  return client;
}
