import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { availabilityGrid } from "@/app/api/v1/_dto/inventory";
import { readAvailabilityGrid } from "@/composition/api";
import { AvailabilityGridQuery } from "@/contracts/api/v1/inventory";

const ROUTE = "/api/v1/staff/branches/[id]/availability";

// API-S20: capacity, sold, free, and blocked per listing and night. A read of
// at most 62 nights, uncached (staffRoute sets no-store).
export const GET = staffRoute(
  { route: ROUTE, query: AvailabilityGridQuery },
  async ({ staff, params, query, setBranch }) => {
    const branchId = String(params.id);
    setBranch(branchId);
    return toHttp(await readAvailabilityGrid(staff, branchId, query), {
      ok: (grid) => json(200, availabilityGrid(grid)),
    });
  },
);
