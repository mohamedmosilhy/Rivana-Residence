import { z } from "zod";

import { isoDate } from "./primitives";

// Physical unit DTOs (API-S21…S23; spec 0003, M6-T5). Zod only (D-7).

const label = z
  .string()
  .trim()
  .min(1, "Enter a unit label.")
  .max(40, "Use at most 40 characters.");

const notes = z
  .string()
  .trim()
  .max(500, "Use at most 500 characters.")
  .nullable();

export const PhysicalRoom = z
  .object({
    id: z.string(),
    branchId: z.string(),
    roomTypeId: z.string(),
    label: z.string(),
    active: z.boolean(),
    notes: z.string().nullable(),
    createdAt: z.string().describe("UTC instant (ISO 8601)."),
    updatedAt: z.string().describe("UTC instant (ISO 8601)."),
  })
  .describe("A physical unit that can be sold. Never deleted or moved.");

export const PhysicalRoomList = z.object({ items: z.array(PhysicalRoom) });

export const PhysicalRoomInput = z
  .object({
    roomTypeId: z.string().min(1),
    label,
    notes: notes
      .optional()
      .describe(
        "At most 500 characters after trimming. Null, empty, or whitespace only means no note.",
      ),
  })
  .strict();

export const PhysicalRoomPatch = z
  .object({
    label: label.optional(),
    notes: notes
      .optional()
      .describe(
        "Null, empty, or whitespace only clears the note; otherwise at most 500 characters after trimming.",
      ),
    active: z
      .boolean()
      .optional()
      .describe("False is checked against sold inventory under a lock."),
  })
  .strict()
  .refine(
    (value) =>
      value.label !== undefined ||
      value.notes !== undefined ||
      value.active !== undefined,
    { message: "Change at least one field." },
  );

export type PhysicalRoomDto = z.infer<typeof PhysicalRoom>;

// Block DTOs (API-S24…S27; spec 0003, M6-T6).

const blockNote = z
  .string()
  .trim()
  .max(500, "Use at most 500 characters.")
  .nullable();

export const BlockReason = z.enum(["MAINTENANCE", "OWNER_USE", "OTHER"]);

export const Block = z
  .object({
    id: z.string(),
    branchId: z.string(),
    physicalRoomId: z.string(),
    startDate: isoDate.describe("First blocked night (YYYY-MM-DD)."),
    endDate: isoDate.describe("Exclusive end (YYYY-MM-DD)."),
    reason: BlockReason,
    note: z.string().nullable(),
    cancelledAt: z.string().nullable().describe("UTC instant (ISO 8601)."),
    createdAt: z.string().describe("UTC instant (ISO 8601)."),
  })
  .describe("A maintenance, owner use, or other block on one unit.");

export const BlockList = z.object({ items: z.array(Block) });

// Shape only: the use case checks the calendar and the 62 night window, so an
// impossible date or an oversized window is a 422 like every other range error.
const queryDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

export const BlockQuery = z
  .object({
    from: queryDate,
    to: queryDate.describe("Exclusive end; at most 62 nights after from."),
  })
  .strict();

export const BlockInput = z
  .object({
    physicalRoomId: z.string().min(1),
    startDate: isoDate,
    endDate: isoDate,
    reason: BlockReason,
    note: blockNote.optional(),
  })
  .strict();

export const BlockPatch = z
  .object({
    endDate: isoDate.optional(),
    note: blockNote
      .optional()
      .describe("Null, empty, or whitespace only clears the note."),
  })
  .strict()
  .refine((value) => value.endDate !== undefined || value.note !== undefined, {
    message: "Change at least one field.",
  });

export type BlockDto = z.infer<typeof Block>;

// Staff availability grid (API-S20; spec 0003, M6-T8).

export const AvailabilityGridQuery = z
  .object({
    from: queryDate,
    to: queryDate.describe("Exclusive end; at most 62 nights after from."),
  })
  .strict();

export const AvailabilityGrid = z
  .object({
    roomTypes: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        nights: z.array(
          z.object({
            night: isoDate,
            capacity: z.number().int().nonnegative(),
            sold: z.number().int().nonnegative(),
            free: z.number().int().nonnegative(),
            blocked: z.number().int().nonnegative(),
          }),
        ),
      }),
    ),
    lastSyncCheckpoint: z
      .string()
      .nullable()
      .describe("UTC instant of the last manual sync. Null until M8."),
  })
  .describe(
    "Per listing and night: capacity (active unblocked units), sold, free, and blocked units. Every listing of the branch appears, whatever its publication status.",
  );

export type AvailabilityGridDto = z.infer<typeof AvailabilityGrid>;
