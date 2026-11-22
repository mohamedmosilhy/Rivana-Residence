import type { AuditLog } from "@/application/audit";
import { authorizeBranch } from "@/application/auth/authorize-branch";
import type { StaffPrincipal } from "@/application/auth/ports";
import type { BranchRepository } from "@/application/branches";
import type { Clock, IdGenerator } from "@/application/shared/providers";
import { failure, success, type Result } from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";
import type { SyncCheckpointKind } from "@/domain/shared/types";

import type {
  ReservationUnitOfWork,
  SyncCheckpointWriter,
  SyncStatusReader,
  SyncStatusSnapshot,
} from "./ports";

export type SyncStatusView = Omit<SyncStatusSnapshot, "lastStartedAt"> &
  Readonly<{
    startedAt: Date | null;
    dueAt: Date;
    due: boolean;
    serverTime: Date;
  }>;

export type SyncCheckpointContext = Readonly<{
  branches: Pick<BranchRepository, "findById">;
  checkpoints: SyncCheckpointWriter & SyncStatusReader;
  audit: AuditLog;
}>;

async function readSyncStatus(
  reader: SyncStatusReader,
  branchId: string,
  clock: Clock,
): Promise<Result<SyncStatusView>> {
  const snapshot = await reader.readStatus(branchId);
  if (!snapshot) return failure("NOT_FOUND", "This branch was not found.");

  const { lastStartedAt, ...status } = snapshot;
  const completedAt = status.lastCompletedAt;
  // Only a strictly newer start takes precedence over completion (Q-77).
  const startedAt =
    lastStartedAt && (!completedAt || lastStartedAt > completedAt)
      ? lastStartedAt
      : null;
  const serverTime = clock.now();
  const checkpointAt = startedAt ?? completedAt;
  const delayMinutes = startedAt
    ? status.followUpMinutes
    : status.intervalMinutes;
  const dueAt = checkpointAt
    ? new Date(checkpointAt.getTime() + delayMinutes * 60_000)
    : serverTime;
  return success({
    ...status,
    startedAt,
    dueAt,
    due: serverTime >= dueAt,
    serverTime,
  });
}

export class GetSyncStatus {
  constructor(
    private readonly deps: Readonly<{ reader: SyncStatusReader; clock: Clock }>,
  ) {}

  async execute(staff: StaffPrincipal | null, branchId: string) {
    const access = authorizeBranch(staff, "reservations:read", branchId);
    if (!access.ok) return access;
    return readSyncStatus(this.deps.reader, branchId, this.deps.clock);
  }
}

export class RecordSyncCheckpoint {
  constructor(
    private readonly deps: Readonly<{
      unitOfWork: ReservationUnitOfWork<SyncCheckpointContext>;
      clock: Clock;
      ids: IdGenerator;
    }>,
  ) {}

  async execute(
    staff: StaffPrincipal | null,
    branchId: string,
    input: Readonly<{ kind: SyncCheckpointKind; note?: string | undefined }>,
  ) {
    const access = authorizeBranch(
      staff,
      "reservations:record-external",
      branchId,
    );
    if (!access.ok) return access;

    const { kind } = input;
    const note = input.note?.trim() || null;
    return this.deps.unitOfWork.run(
      async ({ branches, checkpoints, audit }) => {
        if (!(await branches.findById(branchId))) {
          return failure("NOT_FOUND", "This branch was not found.");
        }
        const id = this.deps.ids.next();
        const recordedAt = this.deps.clock.now();
        const actorId = access.value.id;
        await checkpoints.append({
          id,
          branchId,
          recordedById: actorId,
          recordedAt,
          kind,
          note,
        });
        await audit.append(
          auditEvent({
            action: "sync-checkpoint.recorded",
            entityType: "SyncCheckpoint",
            entityId: id,
            branchId,
            actorType: "STAFF",
            actorId,
            occurredAt: recordedAt,
            reason: null,
            changes: { kind, noteProvided: note !== null },
          }),
        );
        return readSyncStatus(checkpoints, branchId, this.deps.clock);
      },
    );
  }
}
