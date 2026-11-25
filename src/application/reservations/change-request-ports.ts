import type { BranchScope } from "@/application/auth";
import type { ServiceInput } from "@/domain/services";
import type { CancellationClosedReason } from "@/domain/shared/types";
import type { ReservationContactPatch } from "./ports";

export type ChangeRequestStatus = "OPEN" | "APPROVED" | "REJECTED" | "CLOSED";

export type GuestChangeRequest = Readonly<{
  id: string;
  status: ChangeRequestStatus;
  createdAt: Date;
  decisionReason: string | null;
  closedReason: CancellationClosedReason | null;
  previewTotalMinor: number;
}>;

/** Data for replaying the guest's exact request. Kept out of public and staff DTOs. */
export type RequestedGuestChange = Readonly<{
  checkIn: string;
  checkOut: string;
  lines: readonly { roomTypeId: string; adults: number; children: number }[];
  services?: readonly ServiceInput[];
  contact: Pick<
    ReservationContactPatch,
    "fullName" | "email" | "specialRequests"
  >;
}>;

export type ChangeRequestSummary = Readonly<{
  checkIn: string;
  checkOut: string;
  units: readonly { roomTypeId: string; adults: number; children: number }[];
  services: readonly { kind: string; vehicles: number | null }[];
  contactFieldsChanged: readonly string[];
}>;

export type ChangeRequestRecord = GuestChangeRequest &
  Readonly<{
    reservationId: string;
    reservationVersion: number;
    branchId: string;
    requested: RequestedGuestChange;
    oldTotalMinor: number;
    paidTotalMinor: number;
  }>;

export type ChangeRequestListQuery = Readonly<{
  branchId?: string | undefined;
  status?: ChangeRequestStatus | undefined;
  page: number;
  pageSize: number;
}>;

export type ChangeRequestListItem = Omit<GuestChangeRequest, "createdAt"> &
  Readonly<{
    createdAt: string;
    branchId: string;
    reservationId: string;
    reference: string;
    current: ChangeRequestSummary;
    requested: ChangeRequestSummary;
    oldTotalMinor: number;
    currentTotalMinor: number | null;
    paidTotalMinor: number;
    paymentStatus: string;
    lastConflict: string | null;
  }>;

export interface ChangeRequestStore {
  findCurrent(reservationId: string): Promise<GuestChangeRequest | null>;
  /** Read under the reservation lock. */
  findById(id: string): Promise<ChangeRequestRecord | null>;
  create(
    input: Readonly<{
      id: string;
      reservationId: string;
      reservationVersion: number;
      requested: RequestedGuestChange;
      requestedSummary: ChangeRequestSummary;
      oldTotalMinor: number;
      paidTotalMinor: number;
      previewTotalMinor: number;
      at: Date;
    }>,
  ): Promise<GuestChangeRequest>;
  recordConflict(id: string, code: string, at: Date): Promise<void>;
  decide(
    input: Readonly<{
      id: string;
      staffId: string;
      at: Date;
    }> &
      ({ status: "APPROVED" } | { status: "REJECTED"; reason: string }),
  ): Promise<GuestChangeRequest>;
  closeOpen(
    input: Readonly<{
      reservationId: string;
      staffId: string;
      closedReason: CancellationClosedReason;
      at: Date;
    }>,
  ): Promise<string | null>;
}

export interface ChangeRequestReader {
  locate(
    id: string,
    scope: BranchScope,
  ): Promise<{
    id: string;
    branchId: string;
    reservationId: string;
    requestedListingIds: readonly string[];
  } | null>;
  list(
    scope: BranchScope,
    query: ChangeRequestListQuery,
  ): Promise<{
    items: readonly ChangeRequestListItem[];
    total: number;
    page: number;
    pageSize: number;
  }>;
}
