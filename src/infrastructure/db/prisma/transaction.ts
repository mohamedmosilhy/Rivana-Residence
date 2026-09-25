import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export function withTransaction<T>(
  client: DatabaseClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  if ("$transaction" in client) {
    return client.$transaction(operation);
  }
  return operation(client);
}
