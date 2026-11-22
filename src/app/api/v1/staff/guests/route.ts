import { guestListItem } from "@/app/api/v1/_dto/guests";
import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffGuests } from "@/composition/guests";
import { GuestQuery } from "@/contracts/api/v1/guests";

// API-S50. Authorization and branch scope live in the use case.
export const GET = staffRoute(
  { route: "/api/v1/staff/guests", query: GuestQuery },
  async ({ staff, query }) =>
    toHttp(
      await staffGuests().list.execute(staff, {
        page: query.page,
        pageSize: query.pageSize,
        q: query.q,
        blocked:
          query.blocked === undefined ? undefined : query.blocked === "true",
      }),
      {
        ok: (page) =>
          json(200, { ...page, items: page.items.map(guestListItem) }),
      },
    ),
);
