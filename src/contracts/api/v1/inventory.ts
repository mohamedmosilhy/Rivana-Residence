import { z } from "zod";

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
