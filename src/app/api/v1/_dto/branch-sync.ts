import type { SyncStatusView } from "@/application/reservations";
import type { SyncStatusDto } from "@/contracts/api/v1/branch-sync";

export function syncStatus(view: SyncStatusView): SyncStatusDto {
  return {
    lastCompletedAt: view.lastCompletedAt?.toISOString() ?? null,
    lastCompletedBy: view.lastCompletedBy,
    ...(view.startedAt ? { startedAt: view.startedAt.toISOString() } : {}),
    intervalMinutes: view.intervalMinutes,
    followUpMinutes: view.followUpMinutes,
    dueAt: view.dueAt.toISOString(),
    due: view.due,
    notEnteredInHotelSystem: view.notEnteredInHotelSystem,
    ...(view.oldestNotEnteredAt
      ? { oldestNotEnteredAt: view.oldestNotEnteredAt.toISOString() }
      : {}),
    serverTime: view.serverTime.toISOString(),
  };
}
