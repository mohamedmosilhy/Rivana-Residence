import { guestDetail } from "@/app/api/v1/_dto/guests";
import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffGuests } from "@/composition/guests";

// API-S51.
export const GET = staffRoute(
  { route: "/api/v1/staff/guests/[id]" },
  async ({ staff, params }) =>
    toHttp(await staffGuests().get.execute(staff, String(params.id)), {
      ok: (view) => json(200, guestDetail(view)),
    }),
);
