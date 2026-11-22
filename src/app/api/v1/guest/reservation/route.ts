import { guestReservation } from "@/app/api/v1/_dto/guests";
import { bearerToken, json, publicRoute, toHttp } from "@/app/api/v1/_http";
import { GUEST_READ_RATE_LIMIT } from "@/application/shared/public-rate-limit-policy";
import { guestReservationReads } from "@/composition/guests";

// API-G1. The manage token travels in the Authorization header only.
export const GET = publicRoute(
  { route: "/api/v1/guest/reservation", rateLimit: GUEST_READ_RATE_LIMIT },
  async ({ request }) =>
    toHttp(
      await guestReservationReads().view.execute(bearerToken(request.headers)),
      {
        ok: (view) => json(200, guestReservation(view)),
      },
    ),
);
