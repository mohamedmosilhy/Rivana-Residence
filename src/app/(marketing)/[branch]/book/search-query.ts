import { z } from "zod";

import { slugSchema } from "@/domain/shared/slug";
import {
  staySearchFields,
  type StaySearchField,
} from "@/presentation/features/booking/stay-search-form";

type Query = Record<string, string | string[] | undefined>;

const date = (message: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, message);
const guests = (message: string) =>
  z.string().regex(/^-?\d{1,16}(?:\.\d{1,8})?$/, message);

const criteria = z.object({
  checkIn: date("Enter a check-in date."),
  checkOut: date("Enter a check-out date."),
  adults: guests("Enter the number of adults."),
  children: guests("Enter the number of children."),
});

const first = (value: Query[string]) =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

/** Only stay fields trigger the search. Other query values cannot enter P5. */
export function readStaySearchQuery(query: Query) {
  const value = (field: StaySearchField) => first(query[field]).slice(0, 32);
  const submitted = staySearchFields.some(
    (field) => query[field] !== undefined,
  );
  const values = {
    checkIn: value("checkIn"),
    checkOut: value("checkOut"),
    adults: submitted ? value("adults") : "1",
    children: submitted ? value("children") : "0",
  };
  const room = slugSchema.safeParse(query.room);
  const errors: Partial<Record<StaySearchField, string>> = {};
  const parsed = criteria.safeParse(values);

  if (submitted) {
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = staySearchFields.find((key) => key === issue.path[0]);
        if (field) errors[field] = issue.message;
      }
    }
    for (const field of staySearchFields) {
      if (Array.isArray(query[field])) {
        errors[field] = "Enter this value once.";
      }
    }
  }

  const notice = z.enum(["unavailable", "selection"]).safeParse(query.notice);

  return {
    values,
    notice: notice.success ? notice.data : null,
    room: room.success ? room.data : null,
    errors,
    input:
      submitted && parsed.success && Object.keys(errors).length === 0
        ? {
            checkIn: parsed.data.checkIn,
            checkOut: parsed.data.checkOut,
            adults: Number(parsed.data.adults),
            children: Number(parsed.data.children),
          }
        : null,
  };
}
