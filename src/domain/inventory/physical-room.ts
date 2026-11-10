import { z } from "zod";

import { issuesFromZod, type DomainIssue } from "@/domain/shared/domain-error";

export const PHYSICAL_ROOM_LABEL_MAX = 40;
export const PHYSICAL_ROOM_NOTES_MAX = 500;

const label = z
  .string()
  .trim()
  .min(1, "Enter a unit label.")
  .max(
    PHYSICAL_ROOM_LABEL_MAX,
    `Use at most ${PHYSICAL_ROOM_LABEL_MAX} characters.`,
  );

/** A blank note clears the note, the same as null. */
const notes = z
  .string()
  .trim()
  .max(
    PHYSICAL_ROOM_NOTES_MAX,
    `Use at most ${PHYSICAL_ROOM_NOTES_MAX} characters.`,
  )
  .nullable()
  .transform((value) => (value === "" ? null : value));

const physicalRoomInput = z
  .object({
    roomTypeId: z.string().min(1, "Choose a listing."),
    label,
    notes: notes.optional(),
  })
  .strict();

const physicalRoomPatch = z
  .object({
    label: label.optional(),
    notes: notes.optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.label !== undefined ||
      value.notes !== undefined ||
      value.active !== undefined,
    { message: "Change at least one field." },
  );

export type PhysicalRoomInput = Readonly<{
  roomTypeId: string;
  label: string;
  notes: string | null;
}>;

export type PhysicalRoomPatch = Readonly<{
  label?: string;
  notes?: string | null;
  active?: boolean;
}>;

type Parsed<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly DomainIssue[] }>;

function issues(error: z.ZodError): readonly DomainIssue[] {
  return issuesFromZod(error.issues).map((issue) =>
    issue.path === "" ? { ...issue, path: "_root" } : issue,
  );
}

export function parsePhysicalRoomInput(
  input: unknown,
): Parsed<PhysicalRoomInput> {
  const parsed = physicalRoomInput.safeParse(input);
  if (!parsed.success) return { ok: false, issues: issues(parsed.error) };
  return {
    ok: true,
    value: {
      roomTypeId: parsed.data.roomTypeId,
      label: parsed.data.label,
      notes: parsed.data.notes ?? null,
    },
  };
}

export function parsePhysicalRoomPatch(
  input: unknown,
): Parsed<PhysicalRoomPatch> {
  const parsed = physicalRoomPatch.safeParse(input);
  if (!parsed.success) return { ok: false, issues: issues(parsed.error) };
  const { label: nextLabel, notes: nextNotes, active } = parsed.data;
  return {
    ok: true,
    value: {
      ...(nextLabel !== undefined ? { label: nextLabel } : {}),
      ...(nextNotes !== undefined ? { notes: nextNotes } : {}),
      ...(active !== undefined ? { active } : {}),
    },
  };
}
