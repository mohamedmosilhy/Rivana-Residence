import { guestDetail } from "@/app/api/v1/_dto/guests";
import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffGuests } from "@/composition/guests";
import { BlockGuestRequest } from "@/contracts/api/v1/guests";

const route = "/api/v1/staff/guests/[id]/block";

// API-S52. A block is global (Q-29): it applies to every branch.
export const POST = staffRoute(
  { route, body: BlockGuestRequest },
  async ({ staff, params, body }) =>
    toHttp(
      await staffGuests().block.execute(staff, String(params.id), body.reason),
      { ok: (view) => json(200, guestDetail(view)) },
    ),
);

// API-S53.
export const DELETE = staffRoute(
  { route, body: BlockGuestRequest },
  async ({ staff, params, body }) =>
    toHttp(
      await staffGuests().unblock.execute(
        staff,
        String(params.id),
        body.reason,
      ),
      { ok: (view) => json(200, guestDetail(view)) },
    ),
);
