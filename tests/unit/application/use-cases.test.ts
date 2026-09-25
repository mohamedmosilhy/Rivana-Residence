import { describe, expect, it, vi } from "vitest";

import { ResolveBooking } from "@/application/booking/resolve-booking";
import type { PromotionRepository } from "@/application/ports/repositories";
import { GetCurrentPromotion } from "@/application/promotions/get-current-promotion";
import { failure, notPublishable, success } from "@/application/shared/result";
import { DomainValidationError } from "@/domain/shared/domain-error";
import { DisabledBookingProvider } from "@/infrastructure/booking/disabled-booking-provider";
import { isCompleteOrder } from "@/infrastructure/db/prisma/ordering";

describe("results", () => {
  it("builds success and failure values", () => {
    expect(success(1)).toEqual({ ok: true, value: 1 });
    expect(failure("NOT_FOUND", "Missing.")).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "Missing." },
    });
  });

  it("groups domain issues by path for publish failures", () => {
    const error = new DomainValidationError("Not ready.", [
      { path: "media", message: "Needs a hero." },
      { path: "media", message: "Needs ready media." },
      { path: "slug", message: "Invalid slug." },
    ]);

    expect(notPublishable(error)).toEqual({
      ok: false,
      error: {
        code: "NOT_PUBLISHABLE",
        message: "Not ready.",
        fieldErrors: {
          media: ["Needs a hero.", "Needs ready media."],
          slug: ["Invalid slug."],
        },
      },
    });
  });
});

describe("booking", () => {
  it("returns only an unavailable launch descriptor while disabled", async () => {
    const descriptor = await new ResolveBooking(
      new DisabledBookingProvider(),
    ).execute();

    expect(descriptor).toEqual({
      available: false,
      reason: "NOT_CONFIGURED",
      accessibleMessage:
        "Online booking is not available yet. Please contact Rivana Residence directly.",
    });
    expect(descriptor).not.toHaveProperty("url");
  });
});

describe("current promotion", () => {
  it("queries with the injected clock", async () => {
    const now = new Date("2026-10-01T12:00:00Z");
    const getCurrent = vi.fn().mockResolvedValue(null);
    const promotions = { getCurrent } as unknown as PromotionRepository;

    await new GetCurrentPromotion(promotions, { now: () => now }).execute();

    expect(getCurrent).toHaveBeenCalledWith(now);
  });
});

describe("reorder completeness", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it.each([
    [["c", "a", "b"], true],
    [["a", "b"], false],
    [["a", "a", "b"], false],
    [["a", "b", "x"], false],
    [["a", "b", "c", "d"], false],
  ])("%j → %s", (ids, expected) => {
    expect(isCompleteOrder(ids, rows)).toBe(expected);
  });
});
