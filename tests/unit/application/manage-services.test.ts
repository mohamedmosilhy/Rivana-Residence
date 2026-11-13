import { describe, expect, it, vi } from "vitest";

import type { AuditLog } from "@/application/audit";
import type { StaffPrincipal } from "@/application/auth/ports";
import type { ReservationUnitOfWork } from "@/application/reservations";
import {
  ManageServices,
  type ServiceContext,
  type ServiceOfferingRecord,
  type ServiceOfferingRepository,
} from "@/application/services";
import { success } from "@/application/shared/result";
import { Money } from "@/domain/shared/money";
import type { StaffRole } from "@/domain/shared/types";

const BRANCH = "branch-a";
const OTHER = "branch-b";
const NOW = new Date("2031-01-01T10:00:00.000Z");
const usd = (amountMinor: number) =>
  Money.create({ amountMinor, currency: "USD" });
const amount = (amountMinor: number) => ({ amountMinor, currency: "USD" });

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

const body = (overrides: Record<string, unknown> = {}) => ({
  priceUnit: "PER_PERSON",
  price: amount(1_200),
  childPrice: amount(600),
  active: true,
  description: "Buffet",
  ...overrides,
});

function build(stored: ServiceOfferingRecord[] = []) {
  const audits: { action: string; changes: unknown; branchId: unknown }[] = [];
  let rows = [...stored];
  const services: ServiceOfferingRepository = {
    branchExists: vi.fn(async (id) => id === BRANCH || id === OTHER),
    listByBranch: vi.fn(async () => rows),
    upsert: vi.fn(async (write) => {
      const before = rows.find((row) => row.kind === write.kind) ?? null;
      const after: ServiceOfferingRecord = {
        id: "service-new",
        kind: write.kind,
        priceUnit: write.input.priceUnit,
        price: write.input.price,
        childPrice: write.input.childPrice,
        active: write.input.active,
        description: write.input.description,
        updatedAt: write.now(),
      };
      const changed =
        !before ||
        JSON.stringify({ ...before, updatedAt: 0 }) !==
          JSON.stringify({ ...after, updatedAt: 0 });
      if (changed) rows = [...rows.filter((r) => r.kind !== write.kind), after];
      return success({ before, after: changed ? after : before!, changed });
    }),
  };
  const audit: AuditLog = {
    append: vi.fn(async (event) => {
      audits.push(event);
    }),
  };
  const context: ServiceContext = { services, audit };
  const unitOfWork: ReservationUnitOfWork<ServiceContext> = {
    run: vi.fn((operation) => operation(context)),
  };
  const manage = new ManageServices({
    unitOfWork,
    services,
    clock: { now: () => NOW },
    ids: { next: () => "service-new" },
  });
  return { manage, services, unitOfWork, audits };
}

describe("ManageServices.list (API-S35)", () => {
  it("returns both kinds, with absent kinds as null offerings", async () => {
    const { manage } = build([
      {
        id: "service-1",
        kind: "BREAKFAST",
        priceUnit: "PER_PERSON",
        price: usd(1_200),
        childPrice: null,
        active: true,
        description: null,
        updatedAt: NOW,
      },
    ]);
    const result = await manage.list(principal("MANAGER", [BRANCH]), BRANCH);
    expect(result.ok && result.value.map((e) => e.kind)).toEqual([
      "BREAKFAST",
      "AIRPORT_TRANSFER",
    ]);
    expect(result.ok && result.value[0]!.offering).not.toBeNull();
    expect(result.ok && result.value[1]!.offering).toBeNull();
  });

  it("lets a Receptionist read their branch but not another", async () => {
    const { manage, services } = build();
    const staff = principal("RECEPTIONIST", [BRANCH]);
    expect((await manage.list(staff, BRANCH)).ok).toBe(true);
    vi.mocked(services.branchExists).mockClear();
    const refused = await manage.list(staff, OTHER);
    expect(refused).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(services.branchExists).not.toHaveBeenCalled();
  });

  it("answers NOT_FOUND for a missing branch (Admin)", async () => {
    const { manage } = build();
    expect(await manage.list(principal("ADMIN"), "nope")).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});

describe("ManageServices.set (API-S36)", () => {
  it("creates an offering and audits before null and after", async () => {
    const { manage, audits } = build();
    const result = await manage.set(
      principal("MANAGER", [BRANCH]),
      BRANCH,
      "BREAKFAST",
      body(),
    );
    expect(result.ok).toBe(true);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "service.update",
      branchId: BRANCH,
      changes: {
        kind: "BREAKFAST",
        before: null,
        after: {
          priceUnit: "PER_PERSON",
          price: amount(1_200),
          childPrice: amount(600),
          active: true,
        },
      },
    });
    expect(JSON.stringify(audits[0])).not.toContain("Buffet");
  });

  it("audits the change and skips an identical write", async () => {
    const { manage, audits } = build();
    const staff = principal("MANAGER", [BRANCH]);
    await manage.set(staff, BRANCH, "BREAKFAST", body());
    await manage.set(staff, BRANCH, "BREAKFAST", body());
    expect(audits).toHaveLength(1);
    await manage.set(
      staff,
      BRANCH,
      "BREAKFAST",
      body({ price: amount(1_500) }),
    );
    expect(audits).toHaveLength(2);
    expect(audits[1]).toMatchObject({
      changes: {
        before: { price: amount(1_200) },
        after: { price: amount(1_500) },
      },
    });
  });

  it("refuses a Manager outside their branches before any read", async () => {
    const { manage, services, unitOfWork } = build();
    const result = await manage.set(
      principal("MANAGER", [BRANCH]),
      OTHER,
      "BREAKFAST",
      body(),
    );
    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(services.branchExists).not.toHaveBeenCalled();
    expect(unitOfWork.run).not.toHaveBeenCalled();
  });

  it("refuses a Receptionist and an Editor", async () => {
    const { manage } = build();
    for (const staff of [
      principal("RECEPTIONIST", [BRANCH]),
      principal("EDITOR"),
    ]) {
      expect(
        await manage.set(staff, BRANCH, "BREAKFAST", body()),
      ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    }
  });

  it("lets an Admin write any branch and refuses a missing one", async () => {
    const { manage } = build();
    const admin = principal("ADMIN");
    expect((await manage.set(admin, OTHER, "BREAKFAST", body())).ok).toBe(true);
    expect(await manage.set(admin, "nope", "BREAKFAST", body())).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it.each([
    ["unknown kind", "SPA", body(), "kind"],
    [
      "zero price",
      "BREAKFAST",
      body({ price: amount(0) }),
      "price.amountMinor",
    ],
    [
      "child price on a per booking unit",
      "BREAKFAST",
      body({ priceUnit: "PER_BOOKING" }),
      "childPrice",
    ],
    ["a client supplied id", "BREAKFAST", body({ id: "x" }), "_root"],
  ])("refuses %s with a 422 shape", async (_label, kind, input, path) => {
    const { manage, unitOfWork } = build();
    const result = await manage.set(principal("ADMIN"), BRANCH, kind, input);
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(JSON.stringify(result)).toContain(path);
    expect(unitOfWork.run).not.toHaveBeenCalled();
  });
});
