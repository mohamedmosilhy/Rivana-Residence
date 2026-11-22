import { describe, expect, it, vi } from "vitest";

import type { StaffPrincipal } from "@/application/auth";
import {
  GetSyncStatus,
  type SyncStatusSnapshot,
} from "@/application/reservations";

const admin: StaffPrincipal = {
  id: "admin",
  name: "Admin",
  email: "admin@example.test",
  role: "ADMIN",
  branchIds: [],
  sessionId: "admin-session",
};
const time = (hm: string) => new Date(`2031-03-01T${hm}.000Z`);

describe("T-SYNCAPI-1 branch reminder deadlines", () => {
  it.each([
    {
      label: "no history",
      completed: null,
      started: null,
      now: "10:00:00",
      dueAt: "10:00:00",
      activeStart: false,
      due: true,
    },
    {
      label: "only a start",
      completed: null,
      started: "10:00:00",
      now: "10:03:00",
      dueAt: "10:07:00",
      activeStart: true,
      due: false,
    },
    {
      label: "only a completion",
      completed: "10:00:00",
      started: null,
      now: "10:03:00",
      dueAt: "10:42:00",
      activeStart: false,
      due: false,
    },
    {
      label: "an older start",
      completed: "10:00:00",
      started: "09:59:00",
      now: "10:41:59",
      dueAt: "10:42:00",
      activeStart: false,
      due: false,
    },
    {
      label: "equal timestamps and exact due time",
      completed: "10:00:00",
      started: "10:00:00",
      now: "10:42:00",
      dueAt: "10:42:00",
      activeStart: false,
      due: true,
    },
    {
      label: "a newer start past its follow-up",
      completed: "10:00:00",
      started: "10:02:00",
      now: "10:10:00",
      dueAt: "10:09:00",
      activeStart: true,
      due: true,
    },
  ])(
    "uses the branch settings with $label",
    ({ completed, started, now, dueAt, activeStart, due }) => {
      const snapshot: SyncStatusSnapshot = {
        intervalMinutes: 42,
        followUpMinutes: 7,
        lastCompletedAt: completed ? time(completed) : null,
        lastCompletedBy: completed ? admin.id : null,
        lastStartedAt: started ? time(started) : null,
        notEnteredInHotelSystem: 0,
        oldestNotEnteredAt: null,
      };
      const useCase = new GetSyncStatus({
        reader: { readStatus: async () => snapshot },
        clock: { now: () => time(now) },
      });
      return expect(useCase.execute(admin, "branch")).resolves.toMatchObject({
        ok: true,
        value: {
          intervalMinutes: 42,
          followUpMinutes: 7,
          dueAt: time(dueAt),
          due,
          startedAt: activeStart ? snapshot.lastStartedAt : null,
          serverTime: time(now),
        },
      });
    },
  );

  it("rejects a foreign branch before reading its status", async () => {
    const readStatus = vi.fn();
    const useCase = new GetSyncStatus({
      reader: { readStatus },
      clock: { now: () => time("10:00:00") },
    });
    const staff = {
      ...admin,
      role: "RECEPTIONIST",
      branchIds: ["assigned"],
    } as const;
    await expect(useCase.execute(staff, "foreign")).resolves.toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(readStatus).not.toHaveBeenCalled();
  });
});
