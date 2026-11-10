import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { Result } from "@/application/shared/result";
import { failure } from "@/application/shared/result";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

/** Extracts SQLSTATE from Prisma adapter envelopes without exposing messages. */
export function postgresErrorCode(error: unknown): string | undefined {
  const pending: unknown[] = [error];
  const seen = new Set<object>();
  while (pending.length > 0) {
    const value = record(pending.shift());
    if (!value || seen.has(value)) continue;
    seen.add(value);

    for (const key of ["originalCode", "sqlState"] as const) {
      if (typeof value[key] === "string") return value[key];
    }
    if (
      typeof value.code === "string" &&
      /^[0-9A-Z]{5}$/.test(value.code) &&
      !/^P\d{4}$/.test(value.code)
    ) {
      return value.code;
    }
    pending.push(
      value.cause,
      value.meta,
      value.driverAdapterError,
      value.originalError,
    );
  }
  return undefined;
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
      postgresErrorCode(error) === "23514"
    ) {
      return failure("VALIDATION", "A value violates a content rule.");
    }
    if (error.code === "P2025") {
      return failure("NOT_FOUND", "The requested record was not found.");
    }
  }

  throw error;
}
