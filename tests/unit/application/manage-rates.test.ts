import { describe, expect, it, vi } from "vitest";

import type { StaffPrincipal } from "@/application/auth/ports";
import type { AuditLog } from "@/application/audit";
import {
  GetRateCalendar,
  ManageRates,
  type BaseRateRecord,
  type RateContext,
  type RatePeriodRecord,
  type RateRepository,
} from "@/application/pricing";
import type { ReservationUnitOfWork } from "@/application/reservations";
import { success } from "@/application/shared/result";
import { LocalDate } from "@/domain/shared/local-date";
import { Money } from "@/domain/shared/money";
import { StayRange } from "@/domain/shared/stay-range";
import type { StaffRole } from "@/domain/shared/types";

const BRANCH = "branch-a";
const OTHER = "branch-b";
const ROOM_TYPE = "room-type-1";
const NOW = new Date("2031-01-01T10:00:00.000Z");
const usd = (amountMinor: number) =>
  Money.create({ amountMinor, currency: "USD" });
const range = (from: string, to: string) =>
  StayRange.create(LocalDate.parse(from), LocalDate.parse(to));

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

function period(overrides: Partial<RatePeriodRecord> = {}): RatePeriodRecord {
  return {
    id: "period-1",
    roomTypeId: ROOM_TYPE,
    branchId: BRANCH,
    range: range("2031-06-01", "2031-06-10"),
    amount: usd(6_000),
    active: true,
    label: "High season",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function build(
  options: { hidden?: boolean; periods?: RatePeriodRecord[] } = {},
) {
  let base: BaseRateRecord | null = null;
  let periods = options.periods ?? [];
  const audits: unknown[] = [];
  const visible = (scope: "ALL" | readonly string[]) =>
    !options.hidden && (scope === "ALL" || scope.includes(BRANCH));
  const rates: RateRepository = {
    findRoomTypeVisible: vi.fn(async (id, scope) =>
      id === ROOM_TYPE && visible(scope)
        ? { id: ROOM_TYPE, branchId: BRANCH }
        : null,
    ),
    read: vi.fn(async () => ({ baseRate: base, periods })),
    findPeriodVisible: vi.fn(async (id, scope) =>
      visible(scope) ? (periods.find((item) => item.id === id) ?? null) : null,
    ),
    lockPeriodVisible: vi.fn(async (id, scope) =>
      success(
        visible(scope)
          ? (periods.find((item) => item.id === id) ?? null)
          : null,
      ),
    ),
    setBaseRate: vi.fn(async (input) => {
      const before = base;
      const after = {
        roomTypeId: input.roomTypeId,
        amount: input.amount,
        updatedAt: input.at,
      };
      const changed = before?.amount.amountMinor !== input.amount.amountMinor;
      base = changed ? after : before;
      return success({ before, after: base ?? after, changed });
    }),
    createPeriod: vi.fn(async (input) => {
      const created = period({
        id: input.id,
        roomTypeId: input.roomTypeId,
        range: input.range,
        amount: input.amount,
        label: input.label,
        createdAt: input.at,
        updatedAt: input.at,
      });
      periods = [...periods, created];
      return success(created);
    }),
    updatePeriod: vi.fn(async (id, change) => {
      const current = periods.find((item) => item.id === id)!;
      const updated: RatePeriodRecord = {
        ...current,
        ...(change.range ? { range: change.range } : {}),
        ...(change.amount ? { amount: change.amount } : {}),
        ...(change.label !== undefined ? { label: change.label } : {}),
        ...(change.active !== undefined ? { active: change.active } : {}),
        updatedAt: change.at,
      };
      periods = periods.map((item) => (item.id === id ? updated : item));
      return success(updated);
    }),
  };
  const audit: AuditLog = {
    append: vi.fn(async (event) => {
      audits.push(event);
    }),
  };
  const context: RateContext = { rates, audit };
  const unitOfWork: ReservationUnitOfWork<RateContext> = {
    run: vi.fn((operation) => operation(context)),
  };
  const manage = new ManageRates({
    rates,
    unitOfWork,
    clock: { now: () => NOW },
    ids: { next: () => "period-new" },
  });
  return {
    manage,
    calendar: new GetRateCalendar(rates),
    rates,
    unitOfWork,
    audits,
  };
}

describe("rate authorization (M6 AC-7)", () => {
  const roles: ReadonlyArray<[StaffPrincipal | null, boolean, boolean]> = [
    [null, false, false],
    [principal("EDITOR"), false, false],
    [principal("RECEPTIONIST", [BRANCH]), true, false],
    [principal("RECEPTIONIST", [OTHER]), false, false],
    [principal("RECEPTIONIST"), false, false],
    [principal("MANAGER", [BRANCH]), true, true],
    [principal("MANAGER", [OTHER]), false, false],
    [principal("MANAGER"), false, false],
    [principal("ADMIN"), true, true],
  ];

  it.each(roles)(
    "enforces pricing capabilities and branch assignments across every operation %#",
    async (staff, canRead, canWrite) => {
      const read = build();
      expect(
        (
          await read.calendar.execute(staff, ROOM_TYPE, {
            from: "2031-06-01",
            to: "2031-06-02",
          })
        ).ok,
      ).toBe(canRead);
      const base = build();
      expect(
        (
          await base.manage.setBaseRate(staff, ROOM_TYPE, {
            amount: { amountMinor: 5_000, currency: "USD" },
          })
        ).ok,
      ).toBe(canWrite);
      const create = build();
      expect(
        (
          await create.manage.createPeriod(staff, ROOM_TYPE, {
            startDate: "2031-06-01",
            endDate: "2031-06-10",
            amount: { amountMinor: 6_000, currency: "USD" },
          })
        ).ok,
      ).toBe(canWrite);
      const update = build({ periods: [period()] });
      expect(
        (
          await update.manage.updatePeriod(staff, "period-1", {
            label: "Changed",
          })
        ).ok,
      ).toBe(canWrite);
      const deactivate = build({ periods: [period()] });
      expect(
        (await deactivate.manage.deactivatePeriod(staff, "period-1")).ok,
      ).toBe(canWrite);

      const lacksCapability =
        staff === null ||
        staff.role === "EDITOR" ||
        staff.role === "RECEPTIONIST";
      if (lacksCapability) {
        for (const parts of [base, create, update, deactivate]) {
          expect(parts.unitOfWork.run).not.toHaveBeenCalled();
          expect(parts.rates.findRoomTypeVisible).not.toHaveBeenCalled();
          expect(parts.rates.findPeriodVisible).not.toHaveBeenCalled();
        }
      }
    },
  );

  it("hides a resource outside the caller's branch", async () => {
    const parts = build({ hidden: true });
    expect(
      await parts.manage.setBaseRate(
        principal("MANAGER", [BRANCH]),
        ROOM_TYPE,
        { amount: { amountMinor: 5_000, currency: "USD" } },
      ),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(parts.unitOfWork.run).not.toHaveBeenCalled();
  });

  it("hides foreign and missing period ids for both update and deactivation", async () => {
    const manager = principal("MANAGER", [BRANCH]);
    for (const operation of ["update", "deactivate"] as const) {
      const parts = build({ hidden: true, periods: [period()] });
      const result =
        operation === "update"
          ? await parts.manage.updatePeriod(manager, "period-1", {
              label: "Hidden",
            })
          : await parts.manage.deactivatePeriod(manager, "period-1");
      expect(result).toMatchObject({
        ok: false,
        error: { code: "NOT_FOUND" },
      });
      expect(parts.unitOfWork.run).not.toHaveBeenCalled();
      expect(parts.audits).toEqual([]);
    }
  });
});

describe("ManageRates", () => {
  const admin = principal("ADMIN");

  it("audits a base creation with null before and exact after", async () => {
    const parts = build();
    expect(
      await parts.manage.setBaseRate(admin, ROOM_TYPE, {
        amount: { amountMinor: 5_000, currency: "USD" },
      }),
    ).toMatchObject({ ok: true, value: { amount: { amountMinor: 5_000 } } });
    expect(parts.audits).toMatchObject([
      {
        action: "room-base-rate.updated",
        branchId: BRANCH,
        changes: {
          before: null,
          after: { amountMinor: 5_000, currency: "USD" },
        },
      },
    ]);
  });

  it("creates and audits a period without inventing another kind", async () => {
    const parts = build();
    const result = await parts.manage.createPeriod(admin, ROOM_TYPE, {
      startDate: "2031-06-01",
      endDate: "2031-06-10",
      amount: { amountMinor: 6_000, currency: "USD" },
      label: "High season",
    });
    expect(result).toMatchObject({
      ok: true,
      value: { id: "period-new", label: "High season", active: true },
    });
    expect(parts.audits).toMatchObject([
      {
        action: "rate-period.created",
        changes: { before: null, after: { startDate: "2031-06-01" } },
      },
    ]);
  });

  it("merges an update under the period row lock and audits snapshots", async () => {
    const parts = build({ periods: [period()] });
    const result = await parts.manage.updatePeriod(admin, "period-1", {
      endDate: "2031-06-12",
      amount: { amountMinor: 7_000, currency: "USD" },
      active: false,
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        range: { checkOut: { value: "2031-06-12" } },
        amount: { amountMinor: 7_000 },
        active: false,
      },
    });
    expect(parts.rates.lockPeriodVisible).toHaveBeenCalled();
    expect(parts.audits).toMatchObject([
      {
        action: "rate-period.updated",
        changes: {
          before: { endDate: "2031-06-10", active: true },
          after: { endDate: "2031-06-12", active: false },
        },
      },
    ]);
  });

  it("does not write or audit an unchanged patch or repeated deactivation", async () => {
    const parts = build({ periods: [period({ active: false })] });
    expect(
      (
        await parts.manage.updatePeriod(admin, "period-1", {
          label: "High season",
        })
      ).ok,
    ).toBe(true);
    expect((await parts.manage.deactivatePeriod(admin, "period-1")).ok).toBe(
      true,
    );
    expect(parts.rates.updatePeriod).not.toHaveBeenCalled();
    expect(parts.audits).toEqual([]);
  });
});

describe("GetRateCalendar (M6 AC-1)", () => {
  it("returns the 26000 cent worked example and includes inactive periods", async () => {
    const parts = build({
      periods: [
        period({
          id: "first",
          range: range("2031-06-01", "2031-06-03"),
          amount: usd(6_000),
        }),
        period({
          id: "second",
          range: range("2031-06-03", "2031-06-05"),
          amount: usd(7_000),
        }),
        period({ id: "inactive", active: false, amount: usd(1) }),
      ],
    });
    const result = await parts.calendar.execute(
      principal("RECEPTIONIST", [BRANCH]),
      ROOM_TYPE,
      { from: "2031-06-01", to: "2031-06-05" },
    );
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.value.periods).toHaveLength(3);
    expect(
      result.value.calendar.reduce(
        (sum, night) => sum + (night.amount?.amountMinor ?? 0),
        0,
      ),
    ).toBe(26_000);
  });
});
