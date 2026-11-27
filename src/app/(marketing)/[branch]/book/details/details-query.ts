import { Stay } from "@/contracts/api/v1/primitives";
import { QuoteRequest } from "@/contracts/api/v1/quotes";
import { SLUG_PATTERN } from "@/domain/shared/slug";
import {
  decodeSelection,
  type SelectionLine,
  type SelectionStay,
} from "@/presentation/features/booking/selection-link";

type Query = Record<string, string | string[] | undefined>;

export type DetailsQuery =
  | Readonly<{ ok: true; stay: SelectionStay; lines: SelectionLine[] }>
  /** `stay` is kept when the dates are usable, to refill the search. */
  | Readonly<{ ok: false; stay: SelectionStay | null }>;

/** Strict: each value once, within P6's limits. Whether it can be booked is P6's decision. */
export function readDetailsQuery(query: Query): DetailsQuery {
  const stay = Stay.safeParse({
    checkIn: query.checkIn,
    checkOut: query.checkOut,
  });
  if (!stay.success) return { ok: false, stay: null };
  const lines = QuoteRequest.shape.lines.safeParse(
    typeof query.u === "string" ? decodeSelection(query.u) : null,
  );
  return lines.success &&
    lines.data.every(({ roomSlug }) => SLUG_PATTERN.test(roomSlug))
    ? { ok: true, stay: stay.data, lines: lines.data }
    : { ok: false, stay: stay.data };
}
