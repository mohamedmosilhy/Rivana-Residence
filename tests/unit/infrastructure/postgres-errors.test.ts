import { describe, expect, it } from "vitest";

import { postgresErrorCode } from "@/infrastructure/db/prisma/error-translation";

describe("postgresErrorCode", () => {
  it("finds SQLSTATE in the Prisma adapter cause envelope", () => {
    const error = {
      code: "P2010",
      meta: {
        driverAdapterError: {
          cause: { originalCode: "55P03", originalMessage: "private" },
        },
      },
    };

    expect(postgresErrorCode(error)).toBe("55P03");
  });

  it("reads a direct PostgreSQL error without mistaking Prisma codes", () => {
    expect(postgresErrorCode({ code: "23514" })).toBe("23514");
    expect(postgresErrorCode({ code: "P2010" })).toBeUndefined();
  });

  it("handles cyclic and unrelated error objects safely", () => {
    const error: Record<string, unknown> = { message: "private" };
    error.cause = error;

    expect(postgresErrorCode(error)).toBeUndefined();
  });
});
