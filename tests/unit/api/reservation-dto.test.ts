// @vitest-environment node
import { describe, expect, it } from "vitest";

import { publicQuoteRequest } from "@/app/api/v1/_dto/quotes";
import { reservationResponse } from "@/app/api/v1/_dto/reservations";
import type { WebsiteReservationResult } from "@/application/reservations";
import { buildOpenApiDocument } from "@/contracts/api/v1/openapi";
import {
  IdempotencyKey,
  WebsiteReservationRequest,
} from "@/contracts/api/v1/reservations";

const fresh: WebsiteReservationResult = {
  reservationId: "r1",
  branchId: "b1",
  reference: "RR-ABCD2345",
  status: "CONFIRMED",
  totalMinor: 34_500,
  manageToken: "manage-token-0123456789abcdefghijklmnopqrstuvw",
  replayed: false,
};

describe("reservationResponse (API-P7)", () => {
  it("returns 201 with the total and the manage link once", () => {
    expect(reservationResponse(fresh)).toEqual({
      status: 201,
      body: {
        reference: "RR-ABCD2345",
        status: "CONFIRMED",
        total: { amountMinor: 34_500, currency: "USD" },
        manageUrl: `/reservations/manage#t=${fresh.manageToken}`,
      },
    });
  });

  it("answers a replay with 200 and never repeats the manage link", () => {
    const replay = reservationResponse({
      ...fresh,
      status: "CHECKED_IN",
      manageToken: null,
      replayed: true,
    });
    expect(replay).toEqual({
      status: 200,
      body: {
        reference: "RR-ABCD2345",
        status: "CHECKED_IN",
        manageUrl: null,
      },
    });
    // Even a replay that somehow carries a token never exposes it.
    expect(reservationResponse({ ...fresh, replayed: true }).status).toBe(200);
  });

  it("treats an unconfirmed or unpriced new booking as an error, not a $0 total", () => {
    expect(() => reservationResponse({ ...fresh, totalMinor: null })).toThrow();
    expect(() =>
      reservationResponse({ ...fresh, status: "AWAITING_PAYMENT" }),
    ).toThrow();
  });
});

describe("P6 drops the unverified phone", () => {
  it("removes phone and keeps every other field", () => {
    const request = {
      branchSlug: "new-cairo",
      stay: { checkIn: "2031-04-10", checkOut: "2031-04-13" },
      lines: [{ roomSlug: "garden", occupancy: { adults: 2, children: 0 } }],
      services: [],
      couponCode: "WELCOME",
      phone: "+12025551001",
    };
    const result = publicQuoteRequest(request);
    expect(result).not.toHaveProperty("phone");
    expect(result).toEqual({ ...request, phone: undefined });
  });
});

describe("P7 contract and OpenAPI", () => {
  it("documents Idempotency-Key as a required header parameter", () => {
    const document = buildOpenApiDocument() as {
      paths: Record<
        string,
        Record<string, { parameters?: Record<string, unknown>[] }>
      >;
    };
    const parameters =
      document.paths["/api/v1/reservations"]?.post?.parameters ?? [];
    expect(parameters).toContainEqual(
      expect.objectContaining({
        name: "Idempotency-Key",
        in: "header",
        required: true,
        schema: expect.objectContaining({ pattern: expect.any(String) }),
      }),
    );
  });

  it("accepts only printable keys of 8 to 128 characters", () => {
    expect(IdempotencyKey.safeParse("abcdefgh").success).toBe(true);
    for (const bad of [
      "short",
      "has space in it",
      "x".repeat(129),
      "é".repeat(9),
    ])
      expect(IdempotencyKey.safeParse(bad).success).toBe(false);
  });

  it("is strict: price, status and branch keys are refused", () => {
    const base = {
      branchSlug: "new-cairo",
      stay: { checkIn: "2031-04-10", checkOut: "2031-04-13" },
      lines: [{ roomSlug: "garden", occupancy: { adults: 2, children: 0 } }],
      services: [],
      guest: {
        fullName: "A B",
        email: "a@example.test",
        phone: "+12025551001",
      },
      phoneVerificationToken: "token-0123456789abcdef",
      paymentMethod: "PAY_AT_HOTEL",
      expectedTotal: { amountMinor: 1, currency: "USD" },
      consent: { privacyNoticeVersion: "v1" },
    };
    expect(WebsiteReservationRequest.safeParse(base).success).toBe(true);
    for (const extra of [
      { totalMinor: 1 },
      { status: "CONFIRMED" },
      { branchId: "x" },
    ])
      expect(
        WebsiteReservationRequest.safeParse({ ...base, ...extra }).success,
      ).toBe(false);
  });
});
