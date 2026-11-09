import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { physicalRoom } from "@/app/api/v1/_dto/inventory";
import { updatePhysicalRoom } from "@/composition/api";
import { PhysicalRoomPatch } from "@/contracts/api/v1/inventory";

// API-S23 PATCH: label, notes, activity (inventory:manage). Deactivation is
// checked against sold inventory under the listing lock. Audited.
export const PATCH = staffRoute(
  { route: "/api/v1/staff/physical-rooms/[id]", body: PhysicalRoomPatch },
  async ({ staff, params, body }) =>
    toHttp(await updatePhysicalRoom(staff, String(params.id), body), {
      ok: (unit) => json(200, physicalRoom(unit)),
    }),
);
