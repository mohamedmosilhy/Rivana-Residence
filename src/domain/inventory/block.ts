import { z } from "zod";

import {
  DomainValidationError,
  issuesFromZod,
  type DomainIssue,
} from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";
import { StayRange } from "@/domain/shared/stay-range";

export const BLOCK_REASONS = ["MAINTENANCE", "OWNER_USE", "OTHER"] as const;
export type BlockReason = (typeof BLOCK_REASONS)[number];

export const BLOCK_NOTE_MAX = 500;
/** Longest staff read window (S20, S24, S30), in nights. Not a block limit. */
export const STAFF_READ_WINDOW_MAX_NIGHTS = 62;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD format.")
  .refine((value) => {
    try {
      LocalDate.parse(value);
      return true;
    } catch {
      return false;
    }
  }, "Use a real calendar date.");

/** A blank note clears the note, the same as null. */
const note = z
  .string()
  .trim()
  .max(BLOCK_NOTE_MAX, `Use at most ${BLOCK_NOTE_MAX} characters.`)
  .nullable()
  .transform((value) => (value === "" ? null : value));

const blockInput = z
  .object({
    physicalRoomId: z.string().min(1, "Choose a unit."),
    startDate: isoDate,
    endDate: isoDate,
    reason: z.enum(BLOCK_REASONS, "Choose a reason."),
    note: note.optional(),
  })
  .strict();

const blockPatch = z
  .object({ endDate: isoDate.optional(), note: note.optional() })
  .strict()
  .refine((value) => value.endDate !== undefined || value.note !== undefined, {
    message: "Change at least one field.",
  });

export type BlockInput = Readonly<{
  physicalRoomId: string;
  range: StayRange;
  reason: BlockReason;
  note: string | null;
}>;

export type BlockPatch = Readonly<{
  endDate?: LocalDate;
  note?: string | null;
}>;

type Parsed<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly DomainIssue[] }>;

function issues(error: z.ZodError): readonly DomainIssue[] {
  return issuesFromZod(error.issues).map((issue) =>
    issue.path === "" ? { ...issue, path: "_root" } : issue,
  );
}

export function parseBlockInput(input: unknown): Parsed<BlockInput> {
  const parsed = blockInput.safeParse(input);
  if (!parsed.success) return { ok: false, issues: issues(parsed.error) };
  const start = LocalDate.parse(parsed.data.startDate);
  const end = LocalDate.parse(parsed.data.endDate);
  if (end.compare(start) <= 0) {
    return {
      ok: false,
      issues: [{ path: "endDate", message: "End must be after the start." }],
    };
  }
  return {
    ok: true,
    value: {
      physicalRoomId: parsed.data.physicalRoomId,
      range: StayRange.create(start, end),
      reason: parsed.data.reason,
      note: parsed.data.note ?? null,
    },
  };
}

export function parseBlockPatch(input: unknown): Parsed<BlockPatch> {
  const parsed = blockPatch.safeParse(input);
  if (!parsed.success) return { ok: false, issues: issues(parsed.error) };
  const { endDate, note: nextNote } = parsed.data;
  return {
    ok: true,
    value: {
      ...(endDate !== undefined ? { endDate: LocalDate.parse(endDate) } : {}),
      ...(nextNote !== undefined ? { note: nextNote } : {}),
    },
  };
}

/** A staff read window: exclusive end, at most 62 nights. */
export function parseStaffReadWindow(input: unknown): Parsed<StayRange> {
  const parsed = z
    .object({ from: isoDate, to: isoDate })
    .strict()
    .safeParse(input);
  if (!parsed.success) return { ok: false, issues: issues(parsed.error) };
  const from = LocalDate.parse(parsed.data.from);
  const to = LocalDate.parse(parsed.data.to);
  if (to.compare(from) <= 0) {
    return {
      ok: false,
      issues: [{ path: "to", message: "The end must be after the start." }],
    };
  }
  if (from.daysUntil(to) > STAFF_READ_WINDOW_MAX_NIGHTS) {
    return {
      ok: false,
      issues: [
        {
          path: "to",
          message: `Choose at most ${STAFF_READ_WINDOW_MAX_NIGHTS} nights.`,
        },
      ],
    };
  }
  return { ok: true, value: StayRange.create(from, to) };
}

/** The range an end date change would produce; refuses a non positive one. */
export function rangeWithEnd(start: LocalDate, end: LocalDate): StayRange {
  if (end.compare(start) <= 0) {
    throw new DomainValidationError("The block must contain one night.", [
      { path: "endDate", message: "End must be after the start." },
    ]);
  }
  return StayRange.create(start, end);
}
