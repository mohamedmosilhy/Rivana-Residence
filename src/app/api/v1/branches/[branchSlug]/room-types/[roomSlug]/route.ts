import { failure } from "@/application/shared/result";
import { json, publicRoute } from "@/app/api/v1/_http";
import { roomTypeDetail } from "@/app/api/v1/_dto/branches";
import { getPublicRoomType } from "@/composition/api";

// API-P4 GET /api/v1/branches/{branchSlug}/room-types/{roomSlug}: 404 when
// the listing is unpublished or belongs to another branch.
export const GET = publicRoute(
  { route: "/api/v1/branches/[branchSlug]/room-types/[roomSlug]" },
  async ({ params, setBranch }) => {
    const found = await getPublicRoomType(
      String(params.branchSlug),
      String(params.roomSlug),
    );
    if (!found) return failure("NOT_FOUND", "No such listing.");
    setBranch(found.branch.id);
    return json(200, roomTypeDetail(found.branch.slug, found.room));
  },
);
