import { z } from "zod";

import { isoDate } from "./primitives";

// Zod only (D-7). API-S17 to S19 (staff decisions on cancellation requests),
// API-S44 (payments of a reservation) and API-S45 (refund retry).

const Id = z
  .string()
  .min(1)
  .max(32)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value), "Use a valid identifier.");
const Page = z
  .string()
  .regex(/^[1-9]\d*$/)
  .pipe(z.coerce.number<string>().int().min(1).max(21_474_836));
const PageSize = z
  .string()
  .regex(/^[1-9]\d*$/)
  .pipe(z.coerce.number<string>().int().min(1).max(100));
const PlainText = (maximum: number) =>
  z
    .string()
    .max(maximum)
    .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value), "Use plain text.")
    .trim();

export const CANCELLATION_REQUEST_STATUS_VALUES = [
  "OPEN",
  "APPROVED",
  "REJECTED",
  "REFUND_PENDING",
  "REFUND_FAILED",
  "COMPLETED",
  "CLOSED",
] as const;
const Status = z.enum(CANCELLATION_REQUEST_STATUS_VALUES);

/** S17. */
export const StaffCancellationRequestQuery = z.strictObject({
  branchId: Id.optional(),
  status: Status.optional(),
  page: Page.prefault("1"),
  pageSize: PageSize.prefault("25"),
});

/** S18. The note is internal (audit only); it is never sent to the guest. */
export const CancellationApprovalRequest = z.strictObject({
  note: PlainText(500).optional(),
});

/** S19. The reason is sent to the guest. */
export const CancellationRejectionRequest = z.strictObject({
  reason: PlainText(500).min(1),
});

const ListItem = z.strictObject({
  id: Id,
  branchId: Id,
  reservationId: Id,
  reference: z.string(),
  checkIn: isoDate,
  requestedBy: z.enum(["GUEST", "STAFF"]),
  status: Status,
  paymentMethod: z.enum(["PAY_AT_HOTEL", "ONLINE"]),
  paymentStatus: z.enum([
    "NOT_REQUIRED",
    "AWAITING",
    "PAID",
    "FAILED",
    "REFUND_PENDING",
    "REFUNDED",
  ]),
  totalMinor: z.number().int().nullable(),
  guestReason: z.string().nullable(),
  decisionReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export const CancellationRequestList = z.strictObject({
  items: z.array(ListItem),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

/** The request after the decision (and, for a paid booking, after the refund call). */
export const CancellationDecision = z.strictObject({
  id: Id,
  reservationId: Id,
  status: Status,
});

const PaymentStatusValue = z.enum([
  "INITIATED",
  "SUCCEEDED",
  "EXPIRED",
  "FAILED",
  "REFUND_PENDING",
  "REFUNDED",
  "REFUND_FAILED",
]);
const Payment = z.strictObject({
  id: Id,
  status: PaymentStatusValue,
  amountMinor: z.number().int(),
  currency: z.string().length(3),
  providerTransactionId: z.string().nullable(),
  refundAttempt: z.number().int(),
  refundRequestedAt: z.iso.datetime().nullable(),
  refundedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export const PaymentList = z.strictObject({ items: z.array(Payment) });

export const RefundRetryAccepted = z.strictObject({
  paymentId: Id,
  status: PaymentStatusValue,
});
