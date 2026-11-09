import { describe, expect, it, vi } from "vitest";

import type { AuditLog } from "@/application/audit";
import type { StaffPrincipal } from "@/application/auth/ports";
import {
  ManagePhysicalRooms,
  type InventoryNightRecord,
  type PhysicalRoomContext,
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

function unit(overrides: Partial<PhysicalRoomRecord> = {}): PhysicalRoomRecord {
  return {
    id: "unit-1",
    branchId: BRANCH,
    roomTypeId: ROOM_TYPE,
    label: "101",
    active: true,
    notes: null,
    createdAt: new Date("2027-01-01T00:00:00.000Z"),
    updatedAt: new Date("2027-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

type Setup = Readonly<{
  stored?: PhysicalRoomRecord | undefined;
  nights?: readonly InventoryNightRecord[];
  sold?: () => { night: LocalDate; sold: number }[];
  assignments?: readonly StayRange[];
  blocks?: { id: string; range: StayRange }[];
  lockResult?: ReturnType<typeof success<void>> | ReturnType<typeof failure>;
  clock?: Date;
}>;

function build(setup: Setup = {}) {
  const order: string[] = [];
  let stored: PhysicalRoomRecord | null =
    "stored" in setup ? (setup.stored ?? null) : unit();
  const audits: unknown[] = [];

  const rooms: PhysicalRoomRepository = {
    listByBranch: vi.fn(async () => (stored ? [stored] : [])),
    findVisible: vi.fn(async (_id, visible) =>
      stored && (visible === "ALL" || visible.includes(stored.branchId))
        ? stored
        : null,
    ),
    lockVisible: vi.fn(async (_id, visible) => {
      order.push("lock-row");
      return success(
        stored && (visible === "ALL" || visible.includes(stored.branchId))
          ? stored
          : null,
      );
    }),
    listActiveBlocks: vi.fn(async () => {
      order.push("blocks");
      return setup.blocks ?? [];
    }),
    create: vi.fn(async (input) => {
      order.push("create");
      stored = unit({
        id: input.id,
        branchId: input.branchId,
        roomTypeId: input.roomTypeId,
        label: input.label,
        notes: input.notes,
        createdAt: input.at,
        updatedAt: input.at,
      });
      return success(stored);
    }),
    update: vi.fn(async (_id, change) => {
      order.push("update");
      stored = {
        ...stored!,
        ...(change.label !== undefined ? { label: change.label } : {}),
        ...(change.notes !== undefined ? { notes: change.notes } : {}),
        ...(change.active !== undefined ? { active: change.active } : {}),
        updatedAt: change.at,
      };
      return success(stored);
    }),
  };
  const consumption: ReservationConsumptionReader = {
    readSoldOnDates: vi.fn(async () => []),
    readFutureSold: vi.fn(async () => {
      order.push("sold");
      return (setup.sold?.() ?? []).map((row) => ({
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
      order.push("audit");
      audits.push(event);
    }),
  };
  const context: PhysicalRoomContext = {
    inventoryLock: { lockRoomTypes },
    inventoryReader: {
      readNights: vi.fn(async () => success(setup.nights ?? [])),
    },
    consumption,
    physicalRooms: rooms,
    audit,
  };
  const unitOfWork: ReservationUnitOfWork<PhysicalRoomContext> = {
    run: vi.fn(async (operation) => {
      order.push("transaction");
      return operation(context);
    }),
  };
  const catalog: RoomTypeCatalog = {
    findBranch: vi.fn(async (id) =>
      id === BRANCH || id === OTHER ? { id, timeZone: "Africa/Cairo" } : null,
    ),
    branchOwnsRoomType: vi.fn(
      async (branchId, roomTypeId) =>
        branchId === BRANCH && roomTypeId === ROOM_TYPE,
    ),
  };
  let counter = 0;
  const useCase = new ManagePhysicalRooms({
    unitOfWork,
    rooms,
    catalog,
    clock: { now: () => setup.clock ?? NOW },
    ids: { next: () => `unit-new-${++counter}` },
  });
  return {
    useCase,
    rooms,
    consumption,
    catalog,
    unitOfWork,
    lockRoomTypes,
    audit,
    audits,
    order,
    context,
  };
}

function noPortCalls(parts: ReturnType<typeof build>) {
  for (const fn of [
    parts.rooms.listByBranch,
    parts.rooms.findVisible,
    parts.rooms.lockVisible,
    parts.rooms.create,
    parts.rooms.update,
    parts.catalog.findBranch,
    parts.catalog.branchOwnsRoomType,
    parts.unitOfWork.run,
    parts.lockRoomTypes,
    parts.audit.append,
  ]) {
    expect(fn).not.toHaveBeenCalled();
  }
}

const ROLE_CASES: ReadonlyArray<
  [string, StaffPrincipal | null, "read" | "manage" | "none"]
> = [
  ["signed out", null, "none"],
  ["admin", principal("ADMIN"), "manage"],
  ["manager in branch", principal("MANAGER", [BRANCH]), "manage"],
  ["manager in another branch", principal("MANAGER", [OTHER]), "none"],
  ["manager with no assignment", principal("MANAGER"), "none"],
  ["receptionist in branch", principal("RECEPTIONIST", [BRANCH]), "read"],
  ["receptionist elsewhere", principal("RECEPTIONIST", [OTHER]), "none"],
  ["editor", principal("EDITOR"), "none"],
];

describe("T-AUTHZ-2: physical room authorization", () => {
  it.each(ROLE_CASES)("%s: S21 list", async (_name, staff, level) => {
    const parts = build();
    const result = await parts.useCase.list(staff, BRANCH);
    if (level === "none") {
      expect(result.ok).toBe(false);
      noPortCalls(parts);
    } else {
      expect(result.ok).toBe(true);
    }
  });

  it.each(ROLE_CASES)("%s: S22 create", async (_name, staff, level) => {
    const parts = build();
    const result = await parts.useCase.create(staff, BRANCH, {
      roomTypeId: ROOM_TYPE,
      label: "201",
    });
    if (level === "manage") {
      expect(result.ok).toBe(true);
    } else {
      expect(result).toMatchObject({
        ok: false,
        error: { code: staff ? "FORBIDDEN" : "UNAUTHENTICATED" },
      });
      noPortCalls(parts);
    }
  });

  it.each(ROLE_CASES)("%s: S23 update", async (_name, staff, level) => {
    const parts = build();
    const result = await parts.useCase.update(staff, "unit-1", {
      label: "102",
    });
    if (level === "manage") {
      expect(result.ok).toBe(true);
      return;
    }
    expect(result.ok).toBe(false);
    if (!staff || staff.role === "EDITOR" || staff.role === "RECEPTIONIST") {
      // Refused by capability, before any data access.
      noPortCalls(parts);
    } else {
      // Branch scoped manager: the unit is hidden, not forbidden.
      expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(parts.unitOfWork.run).not.toHaveBeenCalled();
      expect(parts.rooms.update).not.toHaveBeenCalled();
    }
  });

  it("returns the same 404 for a missing unit and another branch's unit", async () => {
    const hidden = build();
    const missing = build({ stored: undefined });
    const manager = principal("MANAGER", [OTHER]);
    const a = await hidden.useCase.update(manager, "unit-1", { label: "x" });
    const b = await missing.useCase.update(manager, "unit-1", { label: "x" });
    expect(a).toEqual(b);
    expect(a).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("S21 list", () => {
  it("returns not found for a missing branch to an admin", async () => {
    const parts = build();
    const result = await parts.useCase.list(principal("ADMIN"), "missing");
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(parts.rooms.listByBranch).not.toHaveBeenCalled();
  });
});

describe("input validation", () => {
  const admin = principal("ADMIN");
  it.each([
    ["blank label", { roomTypeId: ROOM_TYPE, label: "   " }, "label"],
    [
      "label over 40",
      { roomTypeId: ROOM_TYPE, label: "x".repeat(41) },
      "label",
    ],
    [
      "notes over 500",
      { roomTypeId: ROOM_TYPE, label: "ok", notes: "n".repeat(501) },
      "notes",
    ],
    ["missing listing", { label: "ok" }, "roomTypeId"],
    ["numeric label", { roomTypeId: ROOM_TYPE, label: 5 }, "label"],
  ])("refuses create with %s before any data access", async (_n, body, key) => {
    const parts = build();
    const result = await parts.useCase.create(admin, BRANCH, body);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fieldErrors: { [key]: expect.any(Array) } },
    });
    noPortCalls(parts);
  });

  it.each([
    ["an empty patch", {}],
    ["an unknown field", { label: "ok", branchId: BRANCH }],
    ["moving the listing", { roomTypeId: "other" }],
    ["a non-boolean active", { active: "no" }],
  ])("refuses update with %s before any data access", async (_n, body) => {
    const parts = build();
    const result = await parts.useCase.update(admin, "unit-1", body);
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    noPortCalls(parts);
  });

  it("trims labels and treats a blank note as no note", async () => {
    const parts = build();
    const result = await parts.useCase.create(admin, BRANCH, {
      roomTypeId: ROOM_TYPE,
      label: "  201  ",
      notes: "   ",
    });
    expect(result).toMatchObject({
      ok: true,
      value: { label: "201", notes: null },
    });
  });
});

describe("S22 create", () => {
  const admin = principal("ADMIN");
  it("creates an active unit and its audit event in one transaction without the listing lock", async () => {
    const parts = build();
    const result = await parts.useCase.create(admin, BRANCH, {
      roomTypeId: ROOM_TYPE,
      label: "201",
      notes: "Corner unit, private note",
    });
    expect(result).toMatchObject({
      ok: true,
      value: { id: "unit-new-1", branchId: BRANCH, active: true },
    });
    expect(parts.order).toEqual(["transaction", "create", "audit"]);
    expect(parts.lockRoomTypes).not.toHaveBeenCalled();
    expect(parts.audits).toEqual([
      expect.objectContaining({
        action: "physical-room.created",
        entityType: "PhysicalRoom",
        entityId: "unit-new-1",
        branchId: BRANCH,
        actorId: admin.id,
        occurredAt: NOW,
        changes: {
          roomTypeId: ROOM_TYPE,
          label: "201",
          active: true,
          notesChanged: true,
        },
      }),
    ]);
    expect(JSON.stringify(parts.audits)).not.toContain("private note");
  });

  it("hides a listing from another branch", async () => {
    const parts = build();
    const result = await parts.useCase.create(admin, BRANCH, {
      roomTypeId: "foreign-room",
      label: "201",
    });
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(parts.unitOfWork.run).not.toHaveBeenCalled();
  });

  it("does not audit when the repository reports a duplicate label", async () => {
    const parts = build();
    vi.mocked(parts.rooms.create).mockResolvedValueOnce(
      failure("CONFLICT", "dup", { label: ["dup"] }),
    );
    const result = await parts.useCase.create(admin, BRANCH, {
      roomTypeId: ROOM_TYPE,
      label: "101",
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", fieldErrors: { label: ["dup"] } },
    });
    expect(parts.audit.append).not.toHaveBeenCalled();
  });
});

describe("S23 non-reducing updates", () => {
  const admin = principal("ADMIN");

  it("edits label and notes under the row lock only, auditing label before and after and no note text", async () => {
    const parts = build({ stored: unit({ notes: "old secret" }) });
    const result = await parts.useCase.update(admin, "unit-1", {
      label: "102",
      notes: "new secret",
    });
    expect(result).toMatchObject({ ok: true, value: { label: "102" } });
    expect(parts.order).toEqual(["transaction", "lock-row", "update", "audit"]);
    expect(parts.lockRoomTypes).not.toHaveBeenCalled();
    expect(parts.audits).toEqual([
      expect.objectContaining({
        action: "physical-room.updated",
        changes: {
          label: { from: "101", to: "102" },
          notesChanged: true,
        },
      }),
    ]);
    expect(JSON.stringify(parts.audits)).not.toMatch(/secret/);
  });

  it.each(["", "   ", "\n\t "])(
    "normalizes blank note %j to null on update and audits the clear",
    async (blank) => {
      const parts = build({ stored: unit({ notes: "x" }) });
      const result = await parts.useCase.update(admin, "unit-1", {
        notes: blank,
      });
      expect(result).toMatchObject({ ok: true, value: { notes: null } });
      expect(parts.rooms.update).toHaveBeenCalledWith(
        "unit-1",
        expect.objectContaining({ notes: null }),
      );
      expect(parts.audits).toEqual([
        expect.objectContaining({ changes: { notesChanged: true } }),
      ]);
    },
  );

  it("treats a blank note on a unit without notes as a no-op", async () => {
    const parts = build({ stored: unit({ notes: null }) });
    await parts.useCase.update(admin, "unit-1", { notes: "  " });
    expect(parts.rooms.update).not.toHaveBeenCalled();
    expect(parts.audit.append).not.toHaveBeenCalled();
  });

  it("trims a note before saving it", async () => {
    const parts = build();
    const result = await parts.useCase.update(admin, "unit-1", {
      notes: "  corner  ",
    });
    expect(result).toMatchObject({ ok: true, value: { notes: "corner" } });
  });

  it("clears notes with null", async () => {
    const parts = build({ stored: unit({ notes: "x" }) });
    const result = await parts.useCase.update(admin, "unit-1", { notes: null });
    expect(result).toMatchObject({ ok: true, value: { notes: null } });
    expect(parts.audits).toEqual([
      expect.objectContaining({ changes: { notesChanged: true } }),
    ]);
  });

  it("activates without the listing lock and records the transition", async () => {
    const parts = build({ stored: unit({ active: false }) });
    const result = await parts.useCase.update(admin, "unit-1", {
      active: true,
    });
    expect(result).toMatchObject({ ok: true, value: { active: true } });
    expect(parts.lockRoomTypes).not.toHaveBeenCalled();
    expect(parts.audits).toEqual([
      expect.objectContaining({
        changes: { active: { from: false, to: true } },
      }),
    ]);
  });

  it("returns the current unit and no audit for a no-op patch", async () => {
    const parts = build({ stored: unit({ label: "101" }) });
    const result = await parts.useCase.update(admin, "unit-1", {
      label: "101",
      active: true,
      notes: null,
    });
    expect(result).toMatchObject({ ok: true, value: { label: "101" } });
    expect(parts.rooms.update).not.toHaveBeenCalled();
    expect(parts.audit.append).not.toHaveBeenCalled();
  });

  it("does not audit a duplicate label", async () => {
    const parts = build();
    vi.mocked(parts.rooms.update).mockResolvedValueOnce(
      failure("CONFLICT", "dup", { label: ["dup"] }),
    );
    const result = await parts.useCase.update(admin, "unit-1", {
      label: "102",
    });
    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(parts.audit.append).not.toHaveBeenCalled();
  });
});

describe("T-INV: guarded deactivation", () => {
  const admin = principal("ADMIN");
  const night = (value: string, capacity: number, sold: number) => ({
    roomTypeId: ROOM_TYPE,
    night: date(value),
    capacity,
    blocked: 0,
    sold,
  });

  it("locks the listing, then reloads the unit, blocks, and consumption, then writes and audits", async () => {
    const parts = build();
    const result = await parts.useCase.update(admin, "unit-1", {
      active: false,
    });
    expect(result).toMatchObject({ ok: true, value: { active: false } });
    expect(parts.lockRoomTypes).toHaveBeenCalledWith(BRANCH, [ROOM_TYPE]);
    expect(parts.order).toEqual([
      "transaction",
      "lock-listing",
      "lock-row",
      "blocks",
      "sold",
      "assignments",
      "update",
      "audit",
    ]);
    expect(parts.audits).toEqual([
      expect.objectContaining({
        changes: { active: { from: true, to: false } },
      }),
    ]);
  });

  it("reads consumption from branch-local today with no horizon", async () => {
    // 22:30 UTC on 2027-03-01 is already 2027-03-02 in Cairo (UTC+2).
    const parts = build({ clock: new Date("2027-03-01T22:30:00.000Z") });
    await parts.useCase.update(admin, "unit-1", { active: false });
    expect(parts.consumption.readFutureSold).toHaveBeenCalledWith({
      branchId: BRANCH,
      roomTypeId: ROOM_TYPE,
      from: date("2027-03-02"),
    });
    expect(parts.consumption.readAssignments).toHaveBeenCalledWith({
      branchId: BRANCH,
      physicalRoomId: "unit-1",
      window: { kind: "FROM", from: date("2027-03-02") },
    });
  });

  it("refuses when a sparse sold night far beyond the booking horizon would go negative", async () => {
    const far = "2031-07-04";
    const parts = build({
      sold: () => [{ night: date(far), sold: 1 }],
      nights: [night(far, 1, 1)],
    });
    const result = await parts.useCase.update(admin, "unit-1", {
      active: false,
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: "INVENTORY_UNAVAILABLE",
        message: expect.any(String),
        context: { firstUnavailableNight: far, roomTypeId: ROOM_TYPE },
      },
    });
    expect(parts.rooms.update).not.toHaveBeenCalled();
    expect(parts.audit.append).not.toHaveBeenCalled();
  });

  it("allows deactivation while another unit covers the sold night", async () => {
    const parts = build({
      sold: () => [{ night: date("2027-04-01"), sold: 1 }],
      nights: [night("2027-04-01", 2, 1)],
    });
    const result = await parts.useCase.update(admin, "unit-1", {
      active: false,
    });
    expect(result.ok).toBe(true);
  });

  it("does not subtract a unit twice on a night it is already blocked", async () => {
    const parts = build({
      blocks: [{ id: "block-1", range: range("2027-04-01", "2027-04-03") }],
      sold: () => [{ night: date("2027-04-01"), sold: 1 }],
      // The blocked unit is not counted; one other unit covers the sale.
      nights: [night("2027-04-01", 1, 1)],
    });
    const result = await parts.useCase.update(admin, "unit-1", {
      active: false,
    });
    expect(result.ok).toBe(true);
  });

  it("refuses when a consuming assignment is on the unit", async () => {
    const parts = build({
      assignments: [range("2027-05-01", "2027-05-04")],
    });
    const result = await parts.useCase.update(admin, "unit-1", {
      active: false,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(parts.rooms.update).not.toHaveBeenCalled();
    expect(parts.audit.append).not.toHaveBeenCalled();
  });

  it("uses the guard even when the preliminary read says the unit is inactive, and then makes no change", async () => {
    const parts = build({ stored: unit({ active: false }) });
    const result = await parts.useCase.update(admin, "unit-1", {
      active: false,
    });
    expect(result).toMatchObject({ ok: true, value: { active: false } });
    expect(parts.lockRoomTypes).toHaveBeenCalledOnce();
    expect(parts.rooms.update).not.toHaveBeenCalled();
    expect(parts.audit.append).not.toHaveBeenCalled();
  });

  it("applies a label change together with deactivation under the lock", async () => {
    const parts = build();
    const result = await parts.useCase.update(admin, "unit-1", {
      active: false,
      label: "101-old",
      notes: "closed",
    });
    expect(result).toMatchObject({
      ok: true,
      value: { active: false, label: "101-old" },
    });
    expect(parts.audits).toEqual([
      expect.objectContaining({
        changes: {
          label: { from: "101", to: "101-old" },
          active: { from: true, to: false },
          notesChanged: true,
        },
      }),
    ]);
  });

  it("returns TRY_AGAIN from the lock and reads or writes nothing", async () => {
    const parts = build({
      lockResult: failure("TRY_AGAIN", "Inventory is busy."),
    });
    const result = await parts.useCase.update(admin, "unit-1", {
      active: false,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "TRY_AGAIN" } });
    expect(parts.rooms.lockVisible).not.toHaveBeenCalled();
    expect(parts.rooms.update).not.toHaveBeenCalled();
  });

  it("reports not found when the unit vanished or is hidden after the lock", async () => {
    const parts = build();
    vi.mocked(parts.rooms.lockVisible).mockResolvedValueOnce(success(null));
    const result = await parts.useCase.update(admin, "unit-1", {
      active: false,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(parts.audit.append).not.toHaveBeenCalled();
  });

  it("scopes a manager's deactivation to assigned branches", async () => {
    const parts = build();
    await parts.useCase.update(principal("MANAGER", [BRANCH]), "unit-1", {
      active: false,
    });
    expect(parts.rooms.lockVisible).toHaveBeenCalledWith("unit-1", [BRANCH]);
  });
});
