import { reservationResponse } from "@/app/api/v1/_dto/reservations";
import { json, problem, publicRoute, toHttp } from "@/app/api/v1/_http";
import { BOOKING_CREATE_RATE_LIMIT } from "@/application/shared/public-rate-limit-policy";
import { submitWebsiteBooking } from "@/composition/reservations";
import { WebsiteReservationRequest } from "@/contracts/api/v1/reservations";

// API-P7. The body never carries a price, status or branch id. The key comes
// from the header; the use case owns replay, the token and every lock.
export const POST = publicRoute(
  {
    route: "/api/v1/reservations",
    body: WebsiteReservationRequest,
    rateLimit: BOOKING_CREATE_RATE_LIMIT,
  },
  async ({ body, request, requestId, setBranch }) => {
    // Fetch already trims header values. The body is validated first, so a
    // request with an invalid body and no key gets the body's 422.
    const key = request.headers.get("idempotency-key");
    if (!key) return problem("MISSING_IDEMPOTENCY_KEY", { requestId });
    return toHttp(await submitWebsiteBooking(body, key, request.headers), {
      ok: (result) => {
        setBranch(result.branchId);
        const { status, body: payload } = reservationResponse(result);
        return json(status, payload);
      },
    });
  },
);
