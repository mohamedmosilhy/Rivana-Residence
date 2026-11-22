import { guestReservationSummary } from "@/app/api/v1/_dto/guests";
import { bearerToken, json, publicRoute, toHttp } from "@/app/api/v1/_http";
import { GUEST_READ_RATE_LIMIT } from "@/application/shared/public-rate-limit-policy";
import { guestReservationReads } from "@/composition/guests";

// API-G3. The phone comes from the verified session, never from the client.
export const GET = publicRoute(
  { route: "/api/v1/guest/reservations", rateLimit: GUEST_READ_RATE_LIMIT },
  async ({ request }) =>
    toHttp(
      await guestReservationReads().list.execute(bearerToken(request.headers)),
      {
        ok: ({ items }) =>
          json(200, { items: items.map(guestReservationSummary) }),
      },
    ),
);
