import { describe, expect, it, vi } from "vitest";

import { GetBookingSearchSetup } from "@/application/booking";

import { branchRow } from "../../support/fake-branches";

const enabledBranch = branchRow({
  onlineBookingEnabled: true,
  onlinePaymentEnabled: true,
  checkInTime: "14:00",
  phone: "+20212345678",
  email: "stay@example.test",
});

function setup(
  branch = enabledBranch,
  whatsApp = false,
  email = false,
  payment = false,
) {
  const findRowById = vi.fn(async (id: string) =>
    id === branch.id ? branch : null,
  );
  const isReady = vi.fn(async (channel: "WHATSAPP" | "EMAIL") =>
    channel === "WHATSAPP" ? whatsApp : email,
  );
  const execute = new GetBookingSearchSetup({
    branches: { findRowById },
    channels: { isReady },
    paymentReady: () => payment,
    clock: { now: () => new Date("2026-11-26T22:30:00Z") },
  });
  return { execute, findRowById, isReady };
}

describe("booking search setup", () => {
  it("reads the given active branch and uses its local date and contact details", async () => {
    const { execute, findRowById, isReady } = setup(enabledBranch, true);
    const result = await execute.execute(enabledBranch.id);
    expect(findRowById).toHaveBeenCalledWith(enabledBranch.id);
    expect(result?.today.value).toBe("2026-11-27");
    expect(result).toMatchObject({
      bookable: true,
      phone: enabledBranch.phone,
      email: enabledBranch.email,
    });
    expect(isReady.mock.calls).toEqual([["WHATSAPP"]]);
  });

  it("returns no setup for an inactive or missing branch", async () => {
    const { execute, isReady } = setup({
      ...enabledBranch,
      status: "INACTIVE",
    });
    await expect(execute.execute(enabledBranch.id)).resolves.toBeNull();
    await expect(execute.execute("missing")).resolves.toBeNull();
    expect(isReady).not.toHaveBeenCalled();
  });

  it.each([{ onlineBookingEnabled: false }, { checkInTime: null }])(
    "does not check channels when a booking prerequisite is missing (%j)",
    async (attributes) => {
      const { execute, isReady } = setup(
        { ...enabledBranch, ...attributes },
        true,
        true,
        true,
      );
      await expect(execute.execute(enabledBranch.id)).resolves.toMatchObject({
        bookable: false,
      });
      expect(isReady).not.toHaveBeenCalled();
    },
  );

  it.each([
    [true, true, true, true],
    [true, false, true, false],
    [true, true, false, false],
    [false, true, true, false],
  ])(
    "requires ready email and usable online payment (%s, %s, %s → %s)",
    async (email, branchPayment, gateway, bookable) => {
      const { execute } = setup(
        { ...enabledBranch, onlinePaymentEnabled: branchPayment },
        false,
        email,
        gateway,
      );
      await expect(execute.execute(enabledBranch.id)).resolves.toMatchObject({
        bookable,
      });
    },
  );
});
