import { describe, expect, it, vi } from "vitest";

import { GetBookingSetup } from "@/application/booking";
import type { ServiceOfferingRecord } from "@/application/services";
import { GUEST_CONSENT_VERSIONS } from "@/domain/guests";
import { Money } from "@/domain/shared/money";

import { branchRow } from "../../support/fake-branches";

const enabledBranch = branchRow({
  onlineBookingEnabled: true,
  onlinePaymentEnabled: true,
  checkInTime: "14:00",
  phone: "+20212345678",
  email: "stay@example.test",
});

const offering = (
  kind: ServiceOfferingRecord["kind"],
  active: boolean,
  maxVehicles: number | null = null,
): ServiceOfferingRecord => ({
  id: `service-${kind}`,
  kind,
  maxVehicles,
  priceUnit: kind === "BREAKFAST" ? "PER_PERSON_PER_NIGHT" : "PER_VEHICLE",
  price: Money.create({ amountMinor: 1200, currency: "USD" }),
  childPrice: null,
  active,
  description: "Fictional",
  updatedAt: new Date("2026-11-01T00:00:00Z"),
});

function setup({
  branch = enabledBranch,
  whatsApp = false,
  email = false,
  payment = false,
  services = [] as ServiceOfferingRecord[],
} = {}) {
  const findRowById = vi.fn(async (id: string) =>
    id === branch.id ? branch : null,
  );
  const isReady = vi.fn(async (channel: "WHATSAPP" | "EMAIL") =>
    channel === "WHATSAPP" ? whatsApp : email,
  );
  const listByBranch = vi.fn(async () => services);
  const query = new GetBookingSetup({
    branches: { findRowById },
    channels: { isReady },
    services: { listByBranch },
    paymentReady: () => payment,
    clock: { now: () => new Date("2026-11-26T22:30:00Z") },
  });
  return { query, findRowById, isReady, listByBranch };
}

describe("booking setup", () => {
  it("reads the given active branch and uses its local date, contact details and consent versions", async () => {
    const { query, findRowById, listByBranch } = setup({ whatsApp: true });
    const result = await query.execute(enabledBranch.id);
    expect(findRowById).toHaveBeenCalledWith(enabledBranch.id);
    expect(listByBranch).toHaveBeenCalledWith(enabledBranch.id);
    expect(result?.today.value).toBe("2026-11-27");
    expect(result).toMatchObject({
      bookable: true,
      phone: enabledBranch.phone,
      email: enabledBranch.email,
      checkInTime: "14:00",
      timeZone: "Africa/Cairo",
      consentVersions: GUEST_CONSENT_VERSIONS,
    });
    expect(result).not.toHaveProperty("notBookableReason");
  });

  it("returns no setup for an inactive or missing branch", async () => {
    const { query, isReady, listByBranch } = setup({
      branch: { ...enabledBranch, status: "INACTIVE" },
    });
    await expect(query.execute(enabledBranch.id)).resolves.toBeNull();
    await expect(query.execute("missing")).resolves.toBeNull();
    expect(isReady).not.toHaveBeenCalled();
    expect(listByBranch).not.toHaveBeenCalled();
  });

  it.each([
    [{ onlineBookingEnabled: false }, "ONLINE_BOOKING_DISABLED"],
    [{ checkInTime: null }, "CHECK_IN_TIME_MISSING"],
    [
      { onlineBookingEnabled: false, checkInTime: null },
      "ONLINE_BOOKING_DISABLED",
    ],
  ])(
    "names the missing prerequisite %j and reads no channel",
    async (attributes, reason) => {
      const { query, isReady } = setup({
        branch: { ...enabledBranch, ...attributes },
        whatsApp: true,
        email: true,
        payment: true,
      });
      await expect(query.execute(enabledBranch.id)).resolves.toMatchObject({
        bookable: false,
        notBookableReason: reason,
        channels: { whatsapp: false, email: false },
      });
      expect(isReady).not.toHaveBeenCalled();
    },
  );

  // whatsApp ready, email ready, branch takes online payment, gateway ready.
  it.each(
    [true, false].flatMap((whatsApp) =>
      [true, false].flatMap((email) =>
        [true, false].flatMap((branchPayment) =>
          [true, false].map(
            (gateway) => [whatsApp, email, branchPayment, gateway] as const,
          ),
        ),
      ),
    ),
  )(
    "offers channels and booking for WhatsApp %s, email %s, branch payment %s, gateway %s",
    async (whatsApp, email, branchPayment, gateway) => {
      const { query, isReady } = setup({
        branch: { ...enabledBranch, onlinePaymentEnabled: branchPayment },
        whatsApp,
        email,
        payment: gateway,
      });
      const payment = branchPayment && gateway;
      const emailOffered = email && payment;
      await expect(query.execute(enabledBranch.id)).resolves.toMatchObject({
        onlinePaymentPossible: payment,
        channels: { whatsapp: whatsApp, email: emailOffered },
        ...(whatsApp || emailOffered
          ? { bookable: true }
          : {
              bookable: false,
              notBookableReason: "VERIFICATION_NOT_CONFIGURED",
            }),
      });
      // Email readiness is not even asked where online payment is impossible.
      expect(isReady.mock.calls).toEqual(
        payment ? [["WHATSAPP"], ["EMAIL"]] : [["WHATSAPP"]],
      );
    },
  );

  it("answers readiness for the search page without reading services", async () => {
    const { query, listByBranch } = setup({ whatsApp: true });
    const readiness = await query.readiness(enabledBranch.id);
    expect(readiness).toMatchObject({ bookable: true });
    expect(readiness).not.toHaveProperty("services");
    expect(listByBranch).not.toHaveBeenCalled();
  });

  it("lists only active services, with prices and the transfer's car limit", async () => {
    const { query } = setup({
      whatsApp: true,
      services: [
        offering("BREAKFAST", true),
        offering("AIRPORT_TRANSFER", true, 3),
      ],
    });
    const result = await query.execute(enabledBranch.id);
    expect(result?.maxVehicles).toBe(3);
    expect(result?.services).toEqual([
      {
        kind: "BREAKFAST",
        unit: "PER_PERSON_PER_NIGHT",
        price: Money.create({ amountMinor: 1200, currency: "USD" }),
        childPrice: null,
      },
      {
        kind: "AIRPORT_TRANSFER",
        unit: "PER_VEHICLE",
        price: Money.create({ amountMinor: 1200, currency: "USD" }),
        childPrice: null,
      },
    ]);
    const hidden = await setup({
      whatsApp: true,
      services: [offering("AIRPORT_TRANSFER", false, 3)],
    }).query.execute(enabledBranch.id);
    expect(hidden).toMatchObject({ services: [], maxVehicles: null });
  });
});
