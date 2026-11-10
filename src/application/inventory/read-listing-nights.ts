import type { Result } from "@/application/shared/result";
import { success } from "@/application/shared/result";
import type { LocalDate } from "@/domain/shared/local-date";

import type {
  AvailabilityCatalog,
  CatalogRoomType,
  InventoryNightRecord,
  InventoryReader,
} from "./ports";

/**
 * Lists a branch's listings and reads their nights. The CMS can delete a
 * listing between those two reads, which the reader reports as NOT_FOUND. One
 * retry re-lists, so a deleted listing simply drops out instead of turning a
 * read of an existing branch into a 404.
 */
export async function readListingNights(
  deps: Readonly<{ catalog: AvailabilityCatalog; reader: InventoryReader }>,
  input: Readonly<{
    branchId: string;
    scope: "ALL" | "PUBLISHED";
    nights: readonly LocalDate[];
  }>,
): Promise<
  Result<
    Readonly<{
      roomTypes: readonly CatalogRoomType[];
      records: readonly InventoryNightRecord[];
    }>
  >
> {
  let last: Result<readonly InventoryNightRecord[]> | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const roomTypes = await deps.catalog.listRoomTypes(
      input.branchId,
      input.scope,
    );
    if (roomTypes.length === 0) return success({ roomTypes, records: [] });
    const records = await deps.reader.readNights({
      branchId: input.branchId,
      roomTypeIds: roomTypes.map((roomType) => roomType.id),
      nights: input.nights,
    });
    if (records.ok) return success({ roomTypes, records: records.value });
    if (records.error.code !== "NOT_FOUND") return records;
    last = records;
  }
  return last as Result<never>;
}
