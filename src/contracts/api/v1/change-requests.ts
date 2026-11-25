import { z } from "zod";
import { StaffCancellationRequestQuery } from "./cancellation-requests";
import { isoDate } from "./primitives";

const ChangeRequestStatus = z.enum(["OPEN", "APPROVED", "REJECTED", "CLOSED"]);

export const ChangeRequestDto = z.strictObject({
  id: z.string(),
  status: ChangeRequestStatus,
  createdAt: z.iso.datetime(),
  previewTotalMinor: z.number().int().nonnegative(),
  decisionReason: z.string().nullable(),
  closedReason: z.enum(["STAFF_CANCELLED", "NO_SHOW", "CHECKED_IN"]).nullable(),
});

export const StaffChangeRequestQuery = StaffCancellationRequestQuery.extend({
  status: ChangeRequestStatus.optional(),
});

const StaySummary = z.strictObject({
  checkIn: isoDate,
  checkOut: isoDate,
  units: z.array(
    z.strictObject({
      roomTypeId: z.string(),
      adults: z.number().int(),
      children: z.number().int(),
    }),
  ),
  services: z.array(
    z.strictObject({
      kind: z.string(),
      vehicles: z.number().int().nullable(),
    }),
  ),
  contactFieldsChanged: z.array(z.string()),
});

export const StaffChangeRequestList = z.strictObject({
  items: z.array(
    ChangeRequestDto.extend({
      branchId: z.string(),
      reservationId: z.string(),
      reference: z.string(),
      current: StaySummary,
      requested: StaySummary,
      oldTotalMinor: z.number().int(),
      currentTotalMinor: z.number().int().nullable(),
      paidTotalMinor: z.number().int(),
      paymentStatus: z.string(),
      lastConflict: z.string().nullable(),
    }),
  ),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
