import type { AccommodationType } from "@/domain/shared/types";

// Guest-facing name for a branch's listings (Q-43, FR-CAT-3): both kinds,
// one kind, or nothing to link to.
export function stayLabel(types: Iterable<AccommodationType>) {
  const kinds = new Set(types);
  if (kinds.has("ROOM") && kinds.has("APARTMENT")) return "Rooms & Apartments";
  if (kinds.has("ROOM")) return "Rooms";
  if (kinds.has("APARTMENT")) return "Apartments";
  return null;
}
