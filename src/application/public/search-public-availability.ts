import type { BranchRepository } from "@/application/branches";
import type {
  ListingSearchResult,
  SearchAvailability,
  SearchAvailabilityResult,
} from "@/application/inventory";
import type { RoomRepository } from "@/application/content/ports";
import { failure, success, type Result } from "@/application/shared/result";

import { publicRoom, type PublicRoomCard } from "./view-models";

export type PublicAvailability = Readonly<{
  branchId: string;
  branchSlug: string;
  stay: SearchAvailabilityResult["stay"];
  occupancy: SearchAvailabilityResult["occupancy"];
  results: readonly (Omit<ListingSearchResult, "roomTypeId" | "name"> &
    Readonly<{ roomType: PublicRoomCard }>)[];
}>;

/** Uncached public orchestration. Internal identities are used only to join. */
export class SearchPublicAvailability {
  constructor(
    private readonly deps: Readonly<{
      branches: Pick<BranchRepository, "findActiveRowBySlug">;
      rooms: Pick<RoomRepository, "listPublished">;
      search: Pick<SearchAvailability, "execute">;
    }>,
  ) {}

  async execute(
    slug: string,
    input: unknown,
  ): Promise<Result<PublicAvailability>> {
    const branch = await this.deps.branches.findActiveRowBySlug(slug);
    if (!branch) return failure("NOT_FOUND", "This branch was not found.");
    const found = await this.deps.search.execute(branch.id, input);
    if (!found.ok) return found;
    // Re-read the published catalog after the calculations. Listings deleted
    // or unpublished during the search are omitted, never filled from a cache.
    const rooms = new Map(
      (await this.deps.rooms.listPublished(branch.id))
        .filter(
          (room) => room.branchId === branch.id && room.status === "PUBLISHED",
        )
        .map((room) => [room.id, room]),
    );
    return success({
      branchId: branch.id,
      branchSlug: branch.slug,
      stay: found.value.stay,
      occupancy: found.value.occupancy,
      results: found.value.results.flatMap((result) => {
        const room = rooms.get(result.roomTypeId);
        return room
          ? [
              {
                roomType: publicRoom(room),
                available: result.available,
                unitsAvailable: result.unitsAvailable,
                pricePerNight: result.pricePerNight,
                accommodationTotal: result.accommodationTotal,
                ...(result.reason === undefined
                  ? {}
                  : { reason: result.reason }),
              },
            ]
          : [];
      }),
    });
  }
}
