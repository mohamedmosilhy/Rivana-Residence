import { describe, expect, it } from "vitest";
import { ManageCoupons } from "@/application/coupons";
import type { StaffPrincipal } from "@/application/auth/ports";

const manager: StaffPrincipal = {
  id: "m",
  name: "M",
  email: "m@example.test",
  role: "MANAGER",
  sessionId: "s",
  branchIds: ["own"],
};
function forbiddenDependency(): never {
  throw new Error("Data access before branch authorization");
}
const useCases = () =>
  new ManageCoupons({
    coupons: {
      list: forbiddenDependency,
      branchesExist: forbiddenDependency,
      create: forbiddenDependency,
      lock: forbiddenDependency,
      replace: forbiddenDependency,
    },
    unitOfWork: { run: forbiddenDependency },
    clock: { now: forbiddenDependency },
    ids: { next: forbiddenDependency },
  });
describe("coupon input authorization before dependencies", () => {
  it("rejects a foreign list branch before data access", async () => {
    expect(
      await useCases().list(manager, { branchId: "foreign" }),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
  it.each([
    { allBranches: true, branchIds: [] },
    { allBranches: false, branchIds: ["own", "foreign"] },
  ])(
    "rejects forbidden create scope %j before the transaction",
    async (scope) => {
      expect(
        await useCases().create(manager, {
          code: "SUMMER26",
          kind: "PERCENT",
          percentBasisPoints: 1500,
          active: true,
          ...scope,
        }),
      ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    },
  );
  it("validates a complete create and a patch before repository calls", async () => {
    expect(await useCases().create(manager, {})).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    expect(
      await useCases().update(manager, "id", { code: "OTHER" }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });
});
