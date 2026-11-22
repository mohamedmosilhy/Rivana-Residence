import { guestReservation } from "@/app/api/v1/_dto/guests";
import { bearerToken, json, publicRoute, toHttp } from "@/app/api/v1/_http";
import { GUEST_READ_RATE_LIMIT } from "@/application/shared/public-rate-limit-policy";
import { guestReservationReads } from "@/composition/guests";

// API-G4. Someone else's reference is the same 404 as one that does not exist.
export const GET = publicRoute(
  {
    route: "/api/v1/guest/reservations/[reference]",
    rateLimit: GUEST_READ_RATE_LIMIT,
  },
  async ({ request, params }) =>
    toHttp(
      await guestReservationReads().viewBySession.execute(
        bearerToken(request.headers),
        params.reference,
      ),
      { ok: (view) => json(200, guestReservation(view)) },
    ),
);
