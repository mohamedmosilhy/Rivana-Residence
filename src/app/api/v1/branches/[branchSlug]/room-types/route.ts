import { failure } from "@/application/shared/result";
import { json, publicRoute } from "@/app/api/v1/_http";
import { roomTypeSummary } from "@/app/api/v1/_dto/branches";
import { listPublicRoomTypes } from "@/composition/api";
import { RoomTypeQuery } from "@/contracts/api/v1/branches";

// API-P3 GET /api/v1/branches/{branchSlug}/room-types?type=ROOM|APARTMENT:
// the branch's published listings, in display order.
export const GET = publicRoute(
  { route: "/api/v1/branches/[branchSlug]/room-types", query: RoomTypeQuery },
  async ({ params, query, setBranch }) => {
    const found = await listPublicRoomTypes(String(params.branchSlug));
    if (!found) return failure("NOT_FOUND", "No such branch.");
    setBranch(found.branch.id);
    const items = found.rooms
      .filter((room) => !query.type || room.accommodationType === query.type)
      .map((room) => roomTypeSummary(found.branch.slug, room));
    return json(200, { items });
  },
);
