import { describe, expect, it, vi } from "vitest";

import type {
  InventoryGuardContext,
  InventoryLock,
} from "@/application/inventory";
import {
  InventoryGuard,
  validateInventoryReduction,
} from "@/application/inventory";
import type { ReservationUnitOfWork } from "@/application/reservations";
import { failure, success } from "@/application/shared/result";
import type { InventoryReductionInput } from "@/domain/inventory";
import { LocalDate } from "@/domain/shared/local-date";
import { StayRange } from "@/domain/shared/stay-range";

function date(value: string) {
  return LocalDate.parse(value);
}

function range(checkIn: string, checkOut: string) {
  return StayRange.create(date(checkIn), date(checkOut));
}

function reduction(capacity = 2, sold = 1): InventoryReductionInput {
  return {
    unit: { active: true, blocks: [] },
    change: { kind: "BLOCK", range: range("2027-01-10", "2027-01-12") },
    nights: [{ night: date("2027-01-10"), capacity, sold }],
    assignments: [],
  };
}

function setup(lockResult = success(undefined)) {
  const order: string[] = [];
  const inventoryLock: InventoryLock = {
    lockRoomTypes: vi.fn(async () => {
      order.push("lock");
      return lockResult;
    }),
  };
  const context: InventoryGuardContext = { inventoryLock };
  const unitOfWork: ReservationUnitOfWork<InventoryGuardContext> = {
    run: vi.fn(async (operation) => {
      order.push("transaction");
      return operation(context);
    }),
  };
  return {
    guard: new InventoryGuard(unitOfWork),
    inventoryLock,
    order,
  };
}

describe("InventoryGuard", () => {
  it("runs lock, fresh load, validation, mutation, and audit in order", async () => {
    const { guard, inventoryLock, order } = setup();

    const result = await guard.execute({
      branchId: "branch-1",
      roomTypeIds: ["room-2", "room-1"],
      load: async () => {
        order.push("load");
        return success({ reduction: reduction() });
      },
      validate: (state) => {
        order.push("validate");
        return validateInventoryReduction("room-1", state.reduction);
      },
      mutate: async () => {
        order.push("mutate");
        return success("block-1");
      },
      audit: async () => {
        order.push("audit");
      },
    });

    expect(result).toEqual(success("block-1"));
    expect(inventoryLock.lockRoomTypes).toHaveBeenCalledWith("branch-1", [
      "room-2",
      "room-1",
    ]);
    expect(order).toEqual([
      "transaction",
      "lock",
      "load",
      "validate",
      "mutate",
      "audit",
    ]);
  });

  it("stops before loading when the listing lock fails", async () => {
    const { guard, order } = setup(
      failure("NOT_FOUND", "The requested listing was not found."),
    );
    const load = vi.fn();

    const result = await guard.execute({
      branchId: "branch-1",
      roomTypeIds: ["missing"],
      load,
      validate: vi.fn(),
      mutate: vi.fn(),
      audit: vi.fn(),
    });

    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(load).not.toHaveBeenCalled();
    expect(order).toEqual(["transaction", "lock"]);
  });

  it("stops validation, mutation, and audit when fresh loading fails", async () => {
    const { guard } = setup();
    const validate = vi.fn();
    const mutate = vi.fn();
    const audit = vi.fn();

    const result = await guard.execute({
      branchId: "branch-1",
      roomTypeIds: ["room-1"],
      load: async () => failure("NOT_FOUND", "The unit was not found."),
      validate,
      mutate,
      audit,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(validate).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("does not mutate or audit when validation refuses the reduction", async () => {
    const { guard } = setup();
    const mutate = vi.fn();
    const audit = vi.fn();

    const result = await guard.execute({
      branchId: "branch-1",
      roomTypeIds: ["room-1"],
      load: async () => success({ reduction: reduction(1, 1) }),
      validate: (state) =>
        validateInventoryReduction("room-1", state.reduction),
      mutate,
      audit,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "INVENTORY_UNAVAILABLE",
        message: "The requested inventory is no longer available.",
        context: {
          firstUnavailableNight: "2027-01-10",
          roomTypeId: "room-1",
        },
      },
    });
    expect(mutate).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("does not audit when the mutation returns a failure", async () => {
    const { guard } = setup();
    const audit = vi.fn();

    const result = await guard.execute({
      branchId: "branch-1",
      roomTypeIds: ["room-1"],
      load: async () => success("state"),
      validate: () => success("checked"),
      mutate: async () => failure("CONFLICT", "The write conflicted."),
      audit,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(audit).not.toHaveBeenCalled();
  });

  it("lets an audit exception escape so the unit of work can roll back", async () => {
    const { guard } = setup();
    const auditFailure = new Error("audit unavailable");

    await expect(
      guard.execute({
        branchId: "branch-1",
        roomTypeIds: ["room-1"],
        load: async () => success("state"),
        validate: () => success("checked"),
        mutate: async () => success("value"),
        audit: async () => {
          throw auditFailure;
        },
      }),
    ).rejects.toBe(auditFailure);
  });

  it("reports overlapping blocks as a safe field conflict", () => {
    const result = validateInventoryReduction("room-1", {
      unit: {
        active: true,
        blocks: [{ id: "existing", range: range("2027-01-09", "2027-01-11") }],
      },
      change: { kind: "BLOCK", range: range("2027-01-10", "2027-01-12") },
      nights: [],
      assignments: [],
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "This unit already has a block on those dates.",
        fieldErrors: {
          startDate: ["Choose dates that do not overlap an active block."],
        },
      },
    });
  });

  it("refuses an intersecting consuming assignment before mutation or audit", async () => {
    const { guard } = setup();
    const mutate = vi.fn();
    const audit = vi.fn();

    const result = await guard.execute({
      branchId: "branch-1",
      roomTypeIds: ["room-1"],
      load: async () =>
        success({
          reduction: {
            ...reduction(),
            assignments: [range("2027-01-11", "2027-01-13")],
          },
        }),
      validate: (state) =>
        validateInventoryReduction("room-1", state.reduction),
      mutate,
      audit,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "This unit is assigned during the proposed inventory change.",
      },
    });
    expect(mutate).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});
