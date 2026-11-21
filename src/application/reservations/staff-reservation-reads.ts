import { authorize } from "@/application/auth/authorize";
import {
  authorizeBranch,
  branchScope,
  type BranchScope,
} from "@/application/auth/authorize-branch";
import type { StaffPrincipal } from "@/application/auth/ports";
import type { ReservationHistoryReader } from "@/application/audit";
import type { PagedResult, PageRequest } from "@/application/shared/pagination";
import { failure, success, type Result } from "@/application/shared/result";
import { roleHasCapability, type Capability } from "@/domain/auth/capabilities";
import {
  canEditReservationGuest,
  canModifyReservationStay,
  ReservationStateMachine,
} from "@/domain/reservations";
import { localDateAt } from "@/domain/shared/zoned-time";
import type {
  ReservationSource,
  ReservationStatus,
} from "@/domain/shared/types";

import type { Clock } from "@/application/shared/providers";

import type { StoredReservation } from "./ports";

export type StaffReservationQuery = PageRequest &
  Readonly<{
    branchId?: string | undefined;
    source?: ReservationSource | undefined;
    status?: ReservationStatus | undefined;
    from?: string | undefined;
    to?: string | undefined;
    q?: string | undefined;
    sort: "checkIn" | "-checkIn" | "createdAt" | "-createdAt";
  }>;
export type ReservationListItem = Readonly<{
  id: string;
  branchId: string;
  reference: string;
  source: ReservationSource;
  status: ReservationStatus;
  stay: { checkIn: string; checkOut: string };
  externalReference: string | null;
  guestName: string | null;
  totalMinor: number | null;
  createdAt: string;
}>;

export interface StaffReservationReader {
  list(
    scope: BranchScope,
    query: StaffReservationQuery,
    includeGuest: boolean,
  ): Promise<PagedResult<ReservationListItem>>;
  findVisible(
    id: string,
    scope: BranchScope,
  ): Promise<StoredReservation | null>;
}

const notFound = () => failure("NOT_FOUND", "This reservation was not found.");

export class ListReservations {
  constructor(private readonly reader: Pick<StaffReservationReader, "list">) {}

  async execute(staff: StaffPrincipal | null, query: StaffReservationQuery) {
    const access = query.branchId
      ? authorizeBranch(staff, "reservations:read", query.branchId)
      : authorize(staff, "reservations:read");
    if (!access.ok) return access;
    const scope = query.branchId ? [query.branchId] : branchScope(access.value);
    if (scope !== "ALL" && scope.length === 0)
      return success({
        items: [],
        total: 0,
        page: query.page,
        pageSize: query.pageSize,
      });
    return success(
      await this.reader.list(
        scope,
        query,
        roleHasCapability(access.value.role, "guests:read"),
      ),
    );
  }
}

export class GetReservation {
  constructor(
    private readonly reader: Pick<StaffReservationReader, "findVisible">,
    private readonly clock: Clock = { now: () => new Date() },
  ) {}

  async execute(staff: StaffPrincipal | null, id: string) {
    const found = await findStaffReservation(this.reader, staff, id);
    if (!found.ok) return found;
    const { row, principal } = found.value;
    return success({
      reservation: staffReservationView(row, principal, this.clock.now()),
    });
  }
}

export class GetReservationHistory {
  constructor(
    private readonly reader: Pick<StaffReservationReader, "findVisible">,
    private readonly history: ReservationHistoryReader,
  ) {}

  async execute(staff: StaffPrincipal | null, id: string) {
    const result = await findStaffReservation(this.reader, staff, id);
    if (!result.ok) return result;
    const { row } = result.value;
    return success({
      items: await this.history.listForReservation(row.branchId, row.id),
    });
  }
}

/**
 * The unlocked, branch scoped read every staff command starts with. A foreign
 * or missing reservation is `NOT_FOUND`; the use case re-reads it under its
 * locks before changing anything.
 */
export async function findStaffReservation(
  reader: Pick<StaffReservationReader, "findVisible">,
  staff: StaffPrincipal | null,
  id: string,
  capability: Capability = "reservations:read",
): Promise<Result<{ row: StoredReservation; principal: StaffPrincipal }>> {
  const access = authorize(staff, capability);
  if (!access.ok) return access;
  const scope = branchScope(access.value);
  if (
    id.length === 0 ||
    id.length > 32 ||
    (scope !== "ALL" && scope.length === 0)
  )
    return notFound();
  const row = await reader.findVisible(id, scope);
  return row && authorizeBranch(access.value, capability, row.branchId).ok
    ? success({ row, principal: access.value })
    : notFound();
}

function staffReservationActions(
  staff: StaffPrincipal,
  row: StoredReservation,
  now: Date,
) {
  const today = localDateAt(now, row.branchTimeZone);
  const state = {
    ...row,
    allUnitsAssigned: row.lines.every((line) => line.physicalRoomId !== null),
  };
  const actions: string[] = [];
  if (roleHasCapability(staff.role, "reservations:modify")) {
    if (canEditReservationGuest(state.status))
      actions.push("EDIT_GUEST", "SEND_MANAGE_LINK");
    if (canModifyReservationStay(state.status)) actions.push("MODIFY_STAY");
  }
  if (
    roleHasCapability(staff.role, "reservations:cancel") &&
    ReservationStateMachine.transition(state, "CANCEL_UNPAID", today).allowed
  )
    actions.push("CANCEL");
  if (roleHasCapability(staff.role, "reservations:front-desk")) {
    if (state.status === "CONFIRMED") actions.push("ASSIGN_UNIT");
    for (const action of ["CHECK_IN", "CHECK_OUT", "MARK_NO_SHOW"] as const) {
      if (ReservationStateMachine.transition(state, action, today).allowed)
        actions.push(action);
    }
  }
  if (
    roleHasCapability(staff.role, "reservations:pms-entry") &&
    state.source === "WEBSITE" &&
    state.pmsEnteredAt === null &&
    (state.status === "CONFIRMED" || state.status === "CHECKED_IN")
  )
    actions.push("MARK_ENTERED_IN_HOTEL_SYSTEM");
  if (
    roleHasCapability(staff.role, "reservations:pms-entry") &&
    state.pmsUpdatePendingSince !== null
  )
    actions.push("MARK_CHANGE_ENTERED_IN_HOTEL_SYSTEM");
  return actions;
}

export function staffReservationView(
  row: StoredReservation,
  principal: StaffPrincipal,
  now: Date,
) {
  const showGuest = roleHasCapability(principal.role, "guests:read");
  return {
    id: row.id,
    branchId: row.branchId,
    reference: row.reference,
    source: row.source,
    status: row.status,
    stay: row.stay,
    lines: row.lines,
    version: row.version,
    externalReference: row.externalReference,
    externalChannel: row.externalChannel,
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    contact: showGuest ? row.contact : null,
    internalNotes: showGuest ? row.internalNotes : null,
    couponCode: row.couponCode,
    snapshot: row.snapshot && {
      ...row.snapshot,
      serviceLines: row.snapshot.serviceLines.map((line) => ({
        ...line,
        details: showGuest ? line.details : null,
      })),
    },
    pmsEnteredAt: row.pmsEnteredAt,
    pmsEnteredById: row.pmsEnteredById,
    changeSeq: row.changeSeq,
    pmsUpdatePendingSince: row.pmsUpdatePendingSince,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    statusChangedAt: row.statusChangedAt,
    allowedActions: staffReservationActions(principal, row, now),
  } as const;
}

export type StaffReservationView = ReturnType<typeof staffReservationView>;
