import { describe, expect, it, vi } from "vitest";

import type { AuditLog } from "@/application/audit";
import type { StaffPrincipal } from "@/application/auth/ports";
import {
  ManageBlocks,
  type BlockContext,
  type BlockRecord,
  type BlockRepository,
  type InventoryNightRecord,
  type PhysicalRoomRecord,
  type PhysicalRoomRepository,
  type ReservationConsumptionReader,
  type RoomTypeCatalog,
} from "@/application/inventory";
import type { ReservationUnitOfWork } from "@/application/reservations";
import { failure, success } from "@/application/shared/result";
import { LocalDate } from "@/domain/shared/local-date";
import { StayRange } from "@/domain/shared/stay-range";
import type { StaffRole } from "@/domain/shared/types";

const BRANCH = "branch-a";
const OTHER = "branch-b";
const ROOM_TYPE = "room-type-1";
const NOW = new Date("2027-03-01T10:00:00.000Z");

const date = (value: string) => LocalDate.parse(value);
const range = (from: string, to: string) =>
  StayRange.create(date(from), date(to));

function principal(
  role: StaffRole,
  branchIds: readonly string[] = [],
): StaffPrincipal {
  return {
    id: `staff-${role}`,
    name: role,
    email: `${role}@example.test`,
    role,
    sessionId: "session",
    branchIds,
  };
}

const unit: PhysicalRoomRecord = {
  id: "unit-1",
  branchId: BRANCH,
  roomTypeId: ROOM_TYPE,
  label: "101",
  active: true,
  notes: null,
  createdAt: NOW,
  updatedAt: NOW,
};

function block(overrides: Partial<BlockRecord> = {}): BlockRecord {
  return {
    id: "block-1",
    branchId: BRANCH,
    physicalRoomId: "unit-1",
    roomTypeId: ROOM_TYPE,
    range: range("2027-06-10", "2027-06-12"),
    reason: "MAINTENANCE",
    note: null,
    cancelledAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

type Setup = Readonly<{
  stored?: BlockRecord | null;
  unit?: PhysicalRoomRecord | null;
  otherBlocks?: { id: string; range: StayRange }[];
  nights?: readonly InventoryNightRecord[];
  sold?: { night: LocalDate; sold: number }[];
  assignments?: readonly StayRange[];
  lockResult?: ReturnType<typeof failure> | ReturnType<typeof success<void>>;
  auditFails?: boolean;
}>;

function build(setup: Setup = {}) {
  const order: string[] = [];
  let stored: BlockRecord | null =
    "stored" in setup ? (setup.stored ?? null) : block();
  const audits: unknown[] = [];

  const blocks: BlockRepository = {
    listOverlapping: vi.fn(async () => (stored ? [stored] : [])),
    findVisible: vi.fn(async (_id, visible) =>
      stored && (visible === "ALL" || visible.includes(stored.branchId))
        ? stored
        : null,
    ),
    lockVisible: vi.fn(async (_id, visible) => {
      order.push("lock-block");
      return success(
        stored && (visible === "ALL" || visible.includes(stored.branchId))
          ? stored
          : null,
      );
    }),
    create: vi.fn(async (input) => {
      order.push("create");
      stored = block({
        id: input.id,
        branchId: input.branchId,
        physicalRoomId: input.physicalRoomId,
        range: input.range,
        reason: input.reason,
        note: input.note,
      });
      return success(stored);
    }),
    update: vi.fn(async (_id, change) => {
      order.push("update");
      stored = {
        ...stored!,
        ...(change.endDate
          ? { range: StayRange.create(stored!.range.checkIn, change.endDate) }
          : {}),
        ...(change.note !== undefined ? { note: change.note } : {}),
      };
      return success(stored);
    }),
    cancel: vi.fn(async (_id, input) => {
      order.push("cancel");
      stored = { ...stored!, cancelledAt: input.at };
      return success(stored);
    }),
  };
  const rooms: PhysicalRoomRepository = {
    listByBranch: vi.fn(async () => []),
    findVisible: vi.fn(async (_id, visible) =>
      "unit" in setup && setup.unit === null
        ? null
        : visible === "ALL" || visible.includes(BRANCH)
          ? (setup.unit ?? unit)
          : null,
    ),
    lockVisible: vi.fn(async () => success(unit)),
    listActiveBlocks: vi.fn(async () => {
      order.push("blocks");
      return setup.otherBlocks ?? [];
    }),
    create: vi.fn(),
    update: vi.fn(),
  };
  const consumption: ReservationConsumptionReader = {
    readSoldOnDates: vi.fn(async () => []),
    readFutureSold: vi.fn(async () => {
      order.push("sold");
      return (setup.sold ?? []).map((row) => ({
        roomTypeId: ROOM_TYPE,
        ...row,
      }));
    }),
    readAssignments: vi.fn(async () => {
      order.push("assignments");
      return setup.assignments ?? [];
    }),
  };
  const lockRoomTypes = vi.fn(async () => {
    order.push("lock-listing");
    return setup.lockResult ?? success(undefined);
  });
  const audit: AuditLog = {
    append: vi.fn(async (event) => {
      if (setup.auditFails) throw new Error("audit down");
      order.push("audit");
      audits.push(event);
    }),
  };
  const context: BlockContext = {
    inventoryLock: { lockRoomTypes },
    inventoryReader: {
      readNights: vi.fn(async () => success(setup.nights ?? [])),
    },
    consumption,
    physicalRooms: rooms,
    blocks,
    audit,
  };
  const unitOfWork: ReservationUnitOfWork<BlockContext> = {
    run: vi.fn(async (operation) => {
      order.push("transaction");
      return operation(context);
    }),
  };
  const catalog: RoomTypeCatalog = {
    findBranch: vi.fn(async (id) =>
      id === BRANCH || id === OTHER ? { id, timeZone: "Africa/Cairo" } : null,
    ),
    branchOwnsRoomType: vi.fn(async () => true),
  };
  let counter = 0;
  const useCase = new ManageBlocks({
    unitOfWork,
    blocks,
    rooms,
    catalog,
    clock: { now: () => NOW },
    ids: { next: () => `block-new-${++counter}` },
  });
  return {
    useCase,
    blocks,
    rooms,
    consumption,
    unitOfWork,
    lockRoomTypes,
    audit,
    audits,
    order,
    context,
  };
}

const validInput = {
  physicalRoomId: "unit-1",
  startDate: "2027-06-10",
  endDate: "2027-06-12",
  reason: "MAINTENANCE",
};

const ROLE_CASES: ReadonlyArray<
  [string, StaffPrincipal | null, "read" | "write" | "none"]
> = [
  ["signed out", null, "none"],
  ["admin", principal("ADMIN"), "write"],
  ["manager in branch", principal("MANAGER", [BRANCH]), "write"],
  ["manager elsewhere", principal("MANAGER", [OTHER]), "none"],
  ["receptionist in branch", principal("RECEPTIONIST", [BRANCH]), "write"],
  ["receptionist elsewhere", principal("RECEPTIONIST", [OTHER]), "none"],
  ["editor", principal("EDITOR"), "none"],
];

describe("block authorization", () => {
  const window = { from: "2027-06-01", to: "2027-06-20" };

  it.each(ROLE_CASES)("%s: S24 list", async (_name, staff, level) => {
    const parts = build();
    const result = await parts.useCase.list(staff, BRANCH, window);
    expect(result.ok).toBe(level !== "none");
    if (level === "none")
      expect(parts.blocks.listOverlapping).not.toHaveBeenCalled();
  });

  it.each(ROLE_CASES)("%s: S25 create", async (_name, staff, level) => {
    const parts = build();
    const result = await parts.useCase.create(staff, BRANCH, validInput);
    expect(result.ok).toBe(level === "write");
    if (level !== "write") {
      expect(parts.unitOfWork.run).not.toHaveBeenCalled();
      expect(parts.rooms.findVisible).not.toHaveBeenCalled();
    }
  });

  it.each(ROLE_CASES)("%s: S26 and S27 by id", async (_name, staff, level) => {
    const patch = build();
    const patched = await patch.useCase.update(staff, "block-1", {
      note: "x",
    });
    const cancel = build();
    const cancelled = await cancel.useCase.cancel(staff, "block-1");
    if (level === "write") {
      expect(patched.ok).toBe(true);
      expect(cancelled.ok).toBe(true);
    } else if (staff?.role === "MANAGER" || staff?.role === "RECEPTIONIST") {
      // Capability is fine; the block is hidden from another branch.
      expect(patched).toMatchObject({
        ok: false,
        error: { code: "NOT_FOUND" },
      });
      expect(cancelled).toMatchObject({
        ok: false,
        error: { code: "NOT_FOUND" },
      });
    } else {
      expect(patched.ok).toBe(false);
      expect(cancelled.ok).toBe(false);
      expect(patch.blocks.findVisible).not.toHaveBeenCalled();
    }
  });

  it("hides another branch's unit from a create in this branch", async () => {
    const parts = build({ unit: null });
    expect(
      await parts.useCase.create(principal("ADMIN"), BRANCH, validInput),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(parts.rooms.findVisible).toHaveBeenCalledWith("unit-1", [BRANCH]);
  });
});

describe("S24 list window", () => {
  it.each([
    [{ from: "2027-06-10", to: "2027-06-10" }],
    [{ from: "2027-06-10", to: "2027-06-09" }],
    [{ from: "2027-06-01", to: "2027-08-05" }],
    [{ from: "2027-02-30", to: "2027-03-02" }],
    [{ from: "2027-06-01" }],
    [{ from: "2027-06-01", to: "2027-06-05", extra: 1 }],
  ])("rejects %j", async (query) => {
    const parts = build();
    expect(
      await parts.useCase.list(principal("ADMIN"), BRANCH, query),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(parts.blocks.listOverlapping).not.toHaveBeenCalled();
  });

  it("accepts exactly 62 nights", async () => {
    const parts = build();
    const result = await parts.useCase.list(principal("ADMIN"), BRANCH, {
      from: "2027-06-01",
      to: "2027-08-02",
    });
    expect(result.ok).toBe(true);
  });
});

describe("S25 create", () => {
  const admin = principal("ADMIN");

  it("locks the listing before any read, then writes and audits", async () => {
    const parts = build({ stored: null });
    const result = await parts.useCase.create(admin, BRANCH, {
      ...validInput,
      note: "  boiler  ",
    });
    expect(result).toMatchObject({
      ok: true,
      value: { note: "boiler", reason: "MAINTENANCE" },
    });
    expect(parts.lockRoomTypes).toHaveBeenCalledWith(BRANCH, [ROOM_TYPE]);
    expect(parts.order).toEqual([
      "transaction",
      "lock-listing",
      "blocks",
      "sold",
      "assignments",
      "create",
      "audit",
    ]);
    expect(parts.audits[0]).toMatchObject({
      action: "inventory-block.created",
      entityType: "InventoryBlock",
      branchId: BRANCH,
      changes: { noteChanged: true, startDate: "2027-06-10" },
    });
    expect(JSON.stringify(parts.audits)).not.toContain("boiler");
  });

  it.each([
    [{ ...validInput, endDate: "2027-06-10" }, "endDate"],
    [{ ...validInput, endDate: "2027-06-09" }, "endDate"],
    [{ ...validInput, startDate: "2027-13-01" }, "startDate"],
    [{ ...validInput, reason: "NOPE" }, "reason"],
    [{ ...validInput, note: "x".repeat(501) }, "note"],
    [{ ...validInput, branchId: "other" }, "_root"],
  ])("rejects invalid input %#", async (input, path) => {
    const parts = build();
    const result = await parts.useCase.create(admin, BRANCH, input);
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    if (!result.ok) {
      expect(Object.keys(result.error.fieldErrors ?? {})).toContain(path);
    }
    expect(parts.unitOfWork.run).not.toHaveBeenCalled();
  });

  it("refuses sold overflow, naming the first night", async () => {
    const parts = build({
      stored: null,
      sold: [{ night: date("2027-06-11"), sold: 1 }],
      nights: [
        {
          roomTypeId: ROOM_TYPE,
          night: date("2027-06-11"),
          capacity: 1,
          blocked: 0,
          sold: 1,
        },
      ],
    });
    const result = await parts.useCase.create(admin, BRANCH, validInput);
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "INVENTORY_UNAVAILABLE",
        context: { firstUnavailableNight: "2027-06-11", roomTypeId: ROOM_TYPE },
      },
    });
    expect(parts.blocks.create).not.toHaveBeenCalled();
    expect(parts.audit.append).not.toHaveBeenCalled();
  });

  it("ignores sold nights outside the block range", async () => {
    const parts = build({
      stored: null,
      sold: [
        { night: date("2027-06-12"), sold: 1 },
        { night: date("2027-09-01"), sold: 3 },
      ],
    });
    const result = await parts.useCase.create(admin, BRANCH, validInput);
    expect(result.ok).toBe(true);
    // No sold night intersects the range, so no counts are read at all.
    expect(parts.context.inventoryReader.readNights).not.toHaveBeenCalled();
  });

  it("refuses a block over a consuming assignment", async () => {
    const parts = build({
      stored: null,
      assignments: [range("2027-06-11", "2027-06-14")],
    });
    expect(await parts.useCase.create(admin, BRANCH, validInput)).toMatchObject(
      { ok: false, error: { code: "CONFLICT" } },
    );
  });

  it("refuses an overlap with another block and allows a back to back one", async () => {
    const overlapping = build({
      stored: null,
      otherBlocks: [{ id: "x", range: range("2027-06-11", "2027-06-13") }],
    });
    expect(
      await overlapping.useCase.create(admin, BRANCH, validInput),
    ).toMatchObject({
      ok: false,
      error: {
        code: "CONFLICT",
        fieldErrors: { startDate: expect.any(Array) },
      },
    });
    const adjacent = build({
      stored: null,
      otherBlocks: [{ id: "x", range: range("2027-06-12", "2027-06-14") }],
    });
    expect((await adjacent.useCase.create(admin, BRANCH, validInput)).ok).toBe(
      true,
    );
  });

  it("refuses an inactive unit", async () => {
    const parts = build({ stored: null, unit: { ...unit, active: false } });
    expect(await parts.useCase.create(admin, BRANCH, validInput)).toMatchObject(
      {
        ok: false,
        error: {
          code: "CONFLICT",
          fieldErrors: { physicalRoomId: expect.any(Array) },
        },
      },
    );
  });

  it("maps a lock timeout without touching data", async () => {
    const parts = build({
      stored: null,
      lockResult: failure("TRY_AGAIN", "busy"),
    });
    expect(await parts.useCase.create(admin, BRANCH, validInput)).toMatchObject(
      { ok: false, error: { code: "TRY_AGAIN" } },
    );
    expect(parts.order).not.toContain("blocks");
  });

  it("accepts a very long block without expanding empty dates", async () => {
    const parts = build({ stored: null });
    const result = await parts.useCase.create(admin, BRANCH, {
      ...validInput,
      startDate: "2027-01-01",
      endDate: "9000-01-01",
    });
    expect(result.ok).toBe(true);
    expect(parts.context.inventoryReader.readNights).not.toHaveBeenCalled();
  });

  it("allows a block that starts in the past", async () => {
    const parts = build({ stored: null });
    expect(
      (
        await parts.useCase.create(admin, BRANCH, {
          ...validInput,
          startDate: "2020-01-01",
          endDate: "2020-01-05",
        })
      ).ok,
    ).toBe(true);
  });

  it("propagates an audit failure so the transaction rolls back", async () => {
    const parts = build({ stored: null, auditFails: true });
    await expect(
      parts.useCase.create(admin, BRANCH, validInput),
    ).rejects.toThrow("audit down");
  });
});

describe("S26 update", () => {
  const admin = principal("ADMIN");

  it("takes the listing lock then the block row for an end date change", async () => {
    const parts = build({
      otherBlocks: [
        { id: "block-1", range: range("2027-06-10", "2027-06-12") },
      ],
    });
    const result = await parts.useCase.update(admin, "block-1", {
      endDate: "2027-06-15",
    });
    expect(result).toMatchObject({
      ok: true,
      value: { range: { checkOut: { value: "2027-06-15" } } },
    });
    expect(parts.order.slice(0, 3)).toEqual([
      "transaction",
      "lock-listing",
      "lock-block",
    ]);
    expect(parts.audits[0]).toMatchObject({
      action: "inventory-block.updated",
      changes: { endDate: { from: "2027-06-12", to: "2027-06-15" } },
    });
  });

  it("validates an extension against the replaced range, not the old one twice", async () => {
    // Sold on a night already inside the block must not count as new.
    const parts = build({
      sold: [{ night: date("2027-06-10"), sold: 1 }],
      nights: [
        {
          roomTypeId: ROOM_TYPE,
          night: date("2027-06-10"),
          // Another unit still sells; this unit is already blocked that night.
          capacity: 1,
          blocked: 1,
          sold: 1,
        },
      ],
      otherBlocks: [
        { id: "block-1", range: range("2027-06-10", "2027-06-12") },
      ],
    });
    const result = await parts.useCase.update(admin, "block-1", {
      endDate: "2027-06-15",
    });
    expect(result.ok).toBe(true);
  });

  it("refuses an extension that oversells a new night", async () => {
    const parts = build({
      sold: [{ night: date("2027-06-13"), sold: 1 }],
      nights: [
        {
          roomTypeId: ROOM_TYPE,
          night: date("2027-06-13"),
          capacity: 1,
          blocked: 0,
          sold: 1,
        },
      ],
      otherBlocks: [
        { id: "block-1", range: range("2027-06-10", "2027-06-12") },
      ],
    });
    expect(
      await parts.useCase.update(admin, "block-1", { endDate: "2027-06-15" }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "INVENTORY_UNAVAILABLE",
        context: { firstUnavailableNight: "2027-06-13" },
      },
    });
    expect(parts.blocks.update).not.toHaveBeenCalled();
  });

  it("refuses an extension into another block", async () => {
    const parts = build({
      otherBlocks: [
        { id: "block-1", range: range("2027-06-10", "2027-06-12") },
        { id: "block-2", range: range("2027-06-14", "2027-06-16") },
      ],
    });
    expect(
      await parts.useCase.update(admin, "block-1", { endDate: "2027-06-15" }),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });

  it("refuses an end on or before the start with a field error", async () => {
    const parts = build();
    expect(
      await parts.useCase.update(admin, "block-1", { endDate: "2027-06-10" }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: { endDate: expect.any(Array) },
      },
    });
    expect(parts.unitOfWork.run).not.toHaveBeenCalled();
  });

  it("refuses to change a cancelled block", async () => {
    const cancelled = block({ cancelledAt: NOW });
    for (const input of [{ endDate: "2027-06-20" }, { note: "x" }]) {
      const parts = build({ stored: cancelled });
      expect(await parts.useCase.update(admin, "block-1", input)).toMatchObject(
        { ok: false, error: { code: "CONFLICT" } },
      );
      expect(parts.blocks.update).not.toHaveBeenCalled();
    }
  });

  it("note only edits take no listing lock", async () => {
    const parts = build();
    const result = await parts.useCase.update(admin, "block-1", {
      note: "  new  ",
    });
    expect(result).toMatchObject({ ok: true, value: { note: "new" } });
    expect(parts.lockRoomTypes).not.toHaveBeenCalled();
    expect(parts.order).toEqual([
      "transaction",
      "lock-block",
      "update",
      "audit",
    ]);
    expect(parts.audits[0]).toMatchObject({
      changes: { noteChanged: true },
    });
    expect(JSON.stringify(parts.audits)).not.toContain("new");
  });

  it("writes and audits nothing for a no-op patch", async () => {
    const parts = build({ stored: block({ note: "same" }) });
    expect(
      (await parts.useCase.update(admin, "block-1", { note: "same" })).ok,
    ).toBe(true);
    expect(parts.blocks.update).not.toHaveBeenCalled();
    expect(parts.audit.append).not.toHaveBeenCalled();
  });

  it.each([[{}], [{ reason: "OTHER" }], [{ startDate: "2027-06-01" }]])(
    "rejects patch %j",
    async (input) => {
      const parts = build();
      expect(await parts.useCase.update(admin, "block-1", input)).toMatchObject(
        { ok: false, error: { code: "VALIDATION" } },
      );
    },
  );

  it("hides a missing block", async () => {
    const parts = build({ stored: null });
    expect(
      await parts.useCase.update(admin, "nope", { note: "x" }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("S27 cancel", () => {
  const admin = principal("ADMIN");

  it("cancels under the block lock only, with one audit event", async () => {
    const parts = build();
    expect((await parts.useCase.cancel(admin, "block-1")).ok).toBe(true);
    expect(parts.lockRoomTypes).not.toHaveBeenCalled();
    expect(parts.order).toEqual([
      "transaction",
      "lock-block",
      "cancel",
      "audit",
    ]);
    expect(parts.audits[0]).toMatchObject({
      action: "inventory-block.cancelled",
    });
  });

  it("repeating a cancellation succeeds without a second write or audit", async () => {
    const parts = build({ stored: block({ cancelledAt: NOW }) });
    expect((await parts.useCase.cancel(admin, "block-1")).ok).toBe(true);
    expect(parts.blocks.cancel).not.toHaveBeenCalled();
    expect(parts.audit.append).not.toHaveBeenCalled();
  });

  it("hides a missing block", async () => {
    const parts = build({ stored: null });
    expect(await parts.useCase.cancel(admin, "nope")).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});
