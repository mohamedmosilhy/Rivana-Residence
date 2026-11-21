import { describe, expect, it, vi } from "vitest";

import type { StaffPrincipal } from "@/application/auth/ports";
import {
  CreateStaffReservation,
  GetReservation,
  GetReservationHistory,
  ListReservations,
  RecordExternalReservation,
} from "@/application/reservations";
import { failure } from "@/application/shared/result";

const branchId = "branch-in-scope";
const foreign = "different-branch";
const request = {
  branchId,
  stay: { checkIn: "2031-04-10", checkOut: "2031-04-11" },
  lines: [{ roomTypeId: "room", occupancy: { adults: 1, children: 0 } }],
  guest: {
    fullName: "Guest",
    email: "guest@example.test",
    phone: "+12025550101",
  },
  sendConfirmation: false,
};
const query = { page: 1, pageSize: 25, sort: "-createdAt" } as const;
const key = "a-real-idempotency-key";
const roles = ["ADMIN", "EDITOR", "MANAGER", "RECEPTIONIST"] as const;
const scopes = ["assigned", "foreign", "unassigned"] as const;

const principal = (
  role: StaffPrincipal["role"],
  branchIds: readonly string[],
): StaffPrincipal => ({
  role,
  id: "staff-id",
  branchIds,
  name: "Test Staff",
  email: "staff@example.test",
  sessionId: "session",
});

function fixture() {
  const findByIdempotencyKey = vi.fn(async () => null);
  const exists = vi.fn(async () => false);
  const run = vi.fn(async () =>
    failure("TRY_AGAIN", "Stop at the transaction."),
  );
  const deps = {
    unitOfWork: { run },
    replays: { findByIdempotencyKey },
    externalReferences: { exists },
    crypto: {
      generateToken: vi.fn(() => ""),
      randomBytes: vi.fn(() => new Uint8Array(8)),
      sha256: vi.fn((value: string) => value),
    },
    clock: { now: vi.fn(() => new Date()) },
    ids: { next: vi.fn(() => "id") },
  };
  const reader = {
    list: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 25 })),
    findVisible: vi.fn(async () => null),
  };
  const audit = { listForReservation: vi.fn(async () => []) };
  return {
    create: new CreateStaffReservation(deps),
    record: new RecordExternalReservation(deps),
    list: new ListReservations(reader),
    detail: new GetReservation(reader),
    history: new GetReservationHistory(reader, audit),
    reader,
    audit,
    run,
    findByIdempotencyKey,
    exists,
  };
}

describe("T-AUTHZ-2 staff reservation use cases", () => {
  const scenarios = roles.flatMap((role) =>
    scopes.map((scope) => ({ role, scope })),
  );
  it.each(scenarios)("$role, $scope", async ({ role, scope }) => {
    const f = fixture();
    const staff = principal(
      role,
      scope === "assigned" ? [branchId] : scope === "foreign" ? [foreign] : [],
    );
    const explicitAllowed =
      role === "ADMIN" || (role !== "EDITOR" && scope === "assigned");
    for (const run of [
      f.create.execute(staff, request, key),
      f.record.execute(
        staff,
        { ...request, externalReference: "EXT-101" },
        key,
      ),
    ]) {
      expect(await run).toMatchObject({
        error: { code: explicitAllowed ? "TRY_AGAIN" : "FORBIDDEN" },
      });
    }
    expect(f.run).toHaveBeenCalledTimes(explicitAllowed ? 2 : 0);
    expect(f.findByIdempotencyKey).toHaveBeenCalledTimes(
      explicitAllowed ? 4 : 0,
    );
    expect(f.exists).not.toHaveBeenCalled();

    const list = await f.list.execute(staff, { ...query, branchId });
    expect(list).toMatchObject(
      explicitAllowed ? { ok: true } : { error: { code: "FORBIDDEN" } },
    );
    if (explicitAllowed)
      expect(f.reader.list).toHaveBeenCalledWith(
        [branchId],
        { ...query, branchId },
        true,
      );
    else expect(f.reader.list).not.toHaveBeenCalled();

    for (const useCase of [f.detail, f.history]) {
      const result = await useCase.execute(staff, "reservation");
      expect(result).toMatchObject({
        error: { code: role === "EDITOR" ? "FORBIDDEN" : "NOT_FOUND" },
      });
    }
    if (role === "EDITOR" || (role !== "ADMIN" && scope === "unassigned"))
      expect(f.reader.findVisible).not.toHaveBeenCalled();
    else {
      expect(f.reader.findVisible).toHaveBeenCalledTimes(2);
      expect(f.reader.findVisible).toHaveBeenCalledWith(
        "reservation",
        role === "ADMIN" ? "ALL" : staff.branchIds,
      );
    }
    expect(f.audit.listForReservation).not.toHaveBeenCalled();
  });

  it("refuses anonymous callers before I/O on all five operations", async () => {
    const f = fixture();
    const results = await Promise.all([
      f.create.execute(null, request, key),
      f.record.execute(null, { ...request, externalReference: "EXT-101" }, key),
      f.list.execute(null, query),
      f.detail.execute(null, "reservation"),
      f.history.execute(null, "reservation"),
    ]);
    for (const result of results)
      expect(result).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    for (const reader of [
      f.findByIdempotencyKey,
      f.reader.list,
      f.reader.findVisible,
      f.audit.listForReservation,
    ])
      expect(reader).not.toHaveBeenCalled();
  });

  it("rejects a receptionist's override before any reservation lookup", async () => {
    const f = fixture();
    expect(
      await f.create.execute(
        principal("RECEPTIONIST", [branchId]),
        {
          ...request,
          priceOverride: {
            reason: "Example rate",
            lines: [{ nights: [{ night: "2031-04-10", amountMinor: 1000 }] }],
          },
        },
        key,
      ),
    ).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(f.findByIdempotencyKey).not.toHaveBeenCalled();
    expect(f.run).not.toHaveBeenCalled();
  });
});
