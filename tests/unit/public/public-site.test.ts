// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  SubmitEnquiry,
  type FormTokens,
} from "@/application/enquiries/submit-enquiry";
import { activePromotion } from "@/application/public/public-site";
import {
  publicImage,
  publicPromotionCandidate,
} from "@/application/public/view-models";
import type {
  EnquiryRepository,
  PromotionDto,
} from "@/application/ports/repositories";
import { success } from "@/application/shared/result";
import { HmacFormTokens } from "@/infrastructure/email/hmac-form-tokens";
import { headerText } from "@/infrastructure/email/smtp-contact-delivery";
import { parseServerEnv } from "@/lib/env/schema";

const image = {
  storageKey: "images/2026/09/pool.webp",
  status: "READY" as const,
  rightsConfirmed: true,
  altText: "Indoor pool",
  altOverride: null,
  width: 1600,
  height: 900,
  focalX: 0.3,
  focalY: 0.7,
};

describe("public images", () => {
  it("maps ready, confirmed images with focal position and contextual alt", () => {
    expect(publicImage({ ...image, altOverride: "Pool at night" })).toEqual({
      src: "/media/images/2026/09/pool.webp",
      alt: "Pool at night",
      width: 1600,
      height: 900,
      position: "30% 70%",
    });
    expect(
      publicImage({ ...image, focalX: null, focalY: null })?.position,
    ).toBe("50% 50%");
  });

  it.each([
    [{ status: "PENDING" as const }],
    [{ status: "FAILED" as const }],
    [{ rightsConfirmed: false }],
    [{ width: null }],
  ])("never exposes %o", (overrides) => {
    expect(publicImage({ ...image, ...overrides })).toBeNull();
  });
});

describe("public promotion selection", () => {
  const now = new Date("2026-09-25T12:00:00Z");
  const promotion = (overrides: Partial<PromotionDto>): PromotionDto => ({
    id: "p",
    internalName: "Internal",
    headline: "Headline",
    body: "Body",
    code: "CODE",
    terms: null,
    status: "PUBLISHED",
    startsAt: null,
    endsAt: null,
    priority: 0,
    showAsPopup: true,
    version: 3,
    publishedAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: now,
    ...overrides,
  });

  it("honours start and end times exactly, from cached ISO strings", () => {
    const candidates = [
      publicPromotionCandidate(
        promotion({ id: "ends", endsAt: now, priority: 9 }),
      ),
      publicPromotionCandidate(
        promotion({
          id: "starts",
          startsAt: new Date(now.getTime() + 1),
          priority: 8,
        }),
      ),
      publicPromotionCandidate(promotion({ id: "live", priority: 1 })),
    ];
    // Round-trip through JSON, as the data cache does.
    const cached = JSON.parse(JSON.stringify(candidates));
    expect(activePromotion(cached, now)?.id).toBe("live");
    expect(activePromotion(cached, new Date(now.getTime() + 1))?.id).toBe(
      "starts",
    );
  });

  it("exposes only what the popup needs", () => {
    expect(
      activePromotion([publicPromotionCandidate(promotion({ id: "a" }))], now),
    ).toEqual({
      id: "a",
      version: 3,
      headline: "Headline",
      body: "Body",
      code: "CODE",
      terms: null,
    });
    expect(activePromotion([], now)).toBeNull();
  });
});

describe("form tokens", () => {
  const tokens = new HmacFormTokens("secret-one");

  it("round-trips its issue time", () => {
    const now = new Date("2026-09-25T12:00:00Z");
    expect(tokens.verify(tokens.issue(now))).toEqual(now);
  });

  it.each([
    "",
    "abc",
    "1758801600000.short",
    "1758801600000." + "x".repeat(43),
  ])("rejects %o", (token) => {
    expect(tokens.verify(token)).toBeNull();
  });

  it("rejects a token from another secret or with a changed time", () => {
    const issued = tokens.issue(new Date("2026-09-25T12:00:00Z"));
    expect(new HmacFormTokens("secret-two").verify(issued)).toBeNull();
    const [, signature] = issued.split(".");
    expect(tokens.verify(`1758700000000.${signature}`)).toBeNull();
  });

  it("derives stable, non-reversible client keys", () => {
    expect(tokens.clientKey("203.0.113.9")).toBe(
      tokens.clientKey(" 203.0.113.9 "),
    );
    expect(tokens.clientKey("203.0.113.9")).not.toContain("203");
  });
});

describe("SubmitEnquiry", () => {
  const now = new Date("2026-09-25T12:00:00Z");
  const tokens: FormTokens = {
    issue: () => "token",
    verify: (token) =>
      token === "old"
        ? new Date(now.getTime() - 25 * 60 * 60 * 1000)
        : token === "fresh"
          ? new Date(now.getTime() - 1000)
          : token === "valid"
            ? new Date(now.getTime() - 60_000)
            : null,
    clientKey: (address) => `k-${address}`,
  };
  const values = {
    formToken: "valid",
    name: "Layla Hassan",
    email: "layla@example.test",
    message: "Is the pool heated?",
  };

  function setup(
    delivery: { deliver: ReturnType<typeof vi.fn> } | null = null,
    locked = false,
  ) {
    const enquiries = {
      create: vi.fn(async (input) =>
        success({ ...input, id: "e1", status: "NEW", createdAt: now }),
      ),
      markDelivered: vi.fn(async () => undefined),
      markDeliveryFailed: vi.fn(async () => undefined),
    };
    const throttle = {
      get: vi.fn(async () =>
        locked
          ? {
              failures: 5,
              windowStartedAt: now,
              lockedUntil: new Date(now.getTime() + 60_000),
            }
          : null,
      ),
      recordFailure: vi.fn(async () => ({
        failures: 1,
        windowStartedAt: now,
        lockedUntil: null,
      })),
      clear: vi.fn(),
    };
    const useCase = new SubmitEnquiry({
      enquiries: enquiries as unknown as EnquiryRepository,
      throttle,
      tokens,
      delivery: delivery as never,
      clock: { now: () => now },
    });
    return { enquiries, throttle, useCase };
  }

  it("saves, delivers, and records the message id", async () => {
    const deliver = vi.fn(async () => ({ messageId: "m1" }));
    const { useCase, enquiries, throttle } = setup({ deliver });
    expect(
      await useCase.execute({ values, clientAddress: "203.0.113.9" }),
    ).toEqual(success("accepted"));
    expect(enquiries.create).toHaveBeenCalledWith({
      name: "Layla Hassan",
      email: "layla@example.test",
      phone: null,
      subject: null,
      message: "Is the pool heated?",
    });
    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        enquiryId: "e1",
        replyTo: "layla@example.test",
        subject: "Website enquiry",
      }),
    );
    expect(enquiries.markDelivered).toHaveBeenCalledWith("e1", "m1");
    expect(throttle.recordFailure).toHaveBeenCalledWith(
      "e:k-203.0.113.9",
      expect.any(Object),
      now,
    );
  });

  it("keeps the enquiry and flags it when delivery fails", async () => {
    const { useCase, enquiries } = setup({
      deliver: vi.fn(async () => {
        throw new Error("SMTP down");
      }),
    });
    expect((await useCase.execute({ values, clientAddress: null })).ok).toBe(
      true,
    );
    expect(enquiries.markDeliveryFailed).toHaveBeenCalledWith("e1");
  });

  it("stores for the inbox only when delivery is not configured", async () => {
    const { useCase, enquiries } = setup(null);
    expect((await useCase.execute({ values, clientAddress: null })).ok).toBe(
      true,
    );
    expect(enquiries.create).toHaveBeenCalled();
    expect(enquiries.markDelivered).not.toHaveBeenCalled();
  });

  it.each([
    ["the honeypot is filled", { website: "https://spam.example" }],
    ["the form was submitted too fast", { formToken: "fresh" }],
  ])("accepts silently but stores nothing when %s", async (_, overrides) => {
    const { useCase, enquiries } = setup();
    expect(
      await useCase.execute({
        values: { ...values, ...overrides },
        clientAddress: null,
      }),
    ).toEqual(success("accepted"));
    expect(enquiries.create).not.toHaveBeenCalled();
  });

  it.each([["missing"], ["old"]])(
    "asks for a reload when the token is %s",
    async (formToken) => {
      const { useCase } = setup();
      expect(
        await useCase.execute({
          values: { ...values, formToken },
          clientAddress: null,
        }),
      ).toMatchObject({
        ok: false,
        error: {
          code: "VALIDATION",
          message: expect.stringContaining("Reload"),
        },
      });
    },
  );

  it("rate-limits per client, or globally when the client is unknown", async () => {
    const { useCase, enquiries } = setup(null, true);
    expect(
      await useCase.execute({ values, clientAddress: "203.0.113.9" }),
    ).toMatchObject({
      ok: false,
      error: { code: "RATE_LIMITED" },
    });
    expect(enquiries.create).not.toHaveBeenCalled();
    const unknown = setup();
    await unknown.useCase.execute({ values, clientAddress: null });
    expect(unknown.throttle.get).toHaveBeenCalledWith("e:all");
  });

  it("returns field errors for invalid input", async () => {
    const { useCase } = setup();
    const result = await useCase.execute({
      values: {
        ...values,
        email: "nope",
        message: "<a href=x>hi</a>",
        phone: "call me",
      },
      clientAddress: null,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(!result.ok && Object.keys(result.error.fieldErrors ?? {})).toEqual(
      expect.arrayContaining(["email", "message", "phone"]),
    );
  });
});

describe("email safety and configuration", () => {
  it("keeps visitor text out of other mail headers", () => {
    expect(headerText("Hello\r\nBcc: attacker@example.test", 150)).toBe(
      "Hello Bcc: attacker@example.test",
    );
    expect(headerText("x".repeat(200), 150)).toHaveLength(150);
  });

  it("requires the settings each delivery mode needs", () => {
    expect(() => parseServerEnv({ CONTACT_DELIVERY: "outbox" })).toThrow(
      "CONTACT_OUTBOX_DIR",
    );
    expect(() =>
      parseServerEnv({
        CONTACT_DELIVERY: "smtp",
        SMTP_HOST: "mail.example.test",
      }),
    ).toThrow("SMTP_USER");
    expect(parseServerEnv({}).CONTACT_DELIVERY).toBe("none");
  });
});
