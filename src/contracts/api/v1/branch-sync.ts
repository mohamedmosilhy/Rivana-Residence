import { z } from "zod";

import { ReservationOperationNote } from "./reservations";

export const SyncQuery = z.strictObject({});

export const SyncCheckpointRequest = ReservationOperationNote.extend({
  kind: z.enum(["STARTED", "COMPLETED"]),
});

export const SyncStatus = z.strictObject({
  lastCompletedAt: z.iso.datetime().nullable(),
  lastCompletedBy: z
    .string()
    .nullable()
    .describe("Staff user ID of the last completion."),
  startedAt: z.iso
    .datetime()
    .optional()
    .describe("Start governing the current deadline."),
  intervalMinutes: z.number().int().min(10).max(240),
  followUpMinutes: z.number().int().min(5).max(60),
  dueAt: z.iso.datetime(),
  due: z.boolean(),
  notEnteredInHotelSystem: z.number().int().nonnegative(),
  oldestNotEnteredAt: z.iso
    .datetime()
    .optional()
    .describe("Creation time of the oldest qualifying website booking."),
  serverTime: z.iso.datetime(),
});

export type SyncStatusDto = z.infer<typeof SyncStatus>;
