import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { physicalRoom } from "@/app/api/v1/_dto/inventory";
import { createPhysicalRoom, listPhysicalRooms } from "@/composition/api";
import { PhysicalRoomInput } from "@/contracts/api/v1/inventory";

const ROUTE = "/api/v1/staff/branches/[id]/physical-rooms";

// API-S21 GET: every unit of the branch, inactive ones included.
export const GET = staffRoute(
  { route: ROUTE },
  async ({ staff, params, setBranch }) => {
    const branchId = String(params.id);
    setBranch(branchId);
    return toHttp(await listPhysicalRooms(staff, branchId), {
      ok: (units) => json(200, { items: units.map(physicalRoom) }),
    });
  },
);

// API-S22 POST: adds a unit (inventory:manage). Audited.
export const POST = staffRoute(
  { route: ROUTE, body: PhysicalRoomInput },
  async ({ staff, params, body, setBranch }) => {
    const branchId = String(params.id);
    setBranch(branchId);
    return toHttp(await createPhysicalRoom(staff, branchId, body), {
      ok: (unit) =>
        json(201, physicalRoom(unit), {
          Location: `/api/v1/staff/physical-rooms/${unit.id}`,
        }),
    });
  },
);
