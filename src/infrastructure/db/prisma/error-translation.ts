import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { Result } from "@/application/shared/result";
import { failure } from "@/application/shared/result";

function postgresCode(error: Prisma.PrismaClientKnownRequestError) {
  const cause = (error.meta?.driverAdapterError as { cause?: unknown })?.cause;
  return cause && typeof cause === "object" && "originalCode" in cause
    ? cause.originalCode
    : undefined;
}

export function translatePrismaWriteError(error: unknown): Result<never> {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return failure("CONFLICT", "A record with that unique value exists.");
    }
    if (error.code === "P2003") {
      return failure(
        "REFERENCED",
        "This record is still referenced and cannot be removed.",
      );
    }
    if (
      error.code === "P2000" ||
      error.code === "P2004" ||
      postgresCode(error) === "23514"
    ) {
      return failure("VALIDATION", "A value violates a content rule.");
    }
    if (error.code === "P2025") {
      return failure("NOT_FOUND", "The requested record was not found.");
    }
  }

  throw error;
}
