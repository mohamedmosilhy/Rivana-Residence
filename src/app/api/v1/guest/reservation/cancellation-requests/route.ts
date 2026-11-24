import { cancellationRequest } from "@/app/api/v1/_dto/guests";
import { bearerToken, json, publicRoute, toHttp } from "@/app/api/v1/_http";
import { GUEST_REQUEST_RATE_LIMIT } from "@/application/shared/public-rate-limit-policy";
import { requestCancellation } from "@/composition/guests";
import { CreateCancellationRequest } from "@/contracts/api/v1/guests";

// API-G2. The manage token identifies the reservation.
export const POST = publicRoute(
  {
    route: "/api/v1/guest/reservation/cancellation-requests",
    body: CreateCancellationRequest,
    bodyOptional: true,
    rateLimit: GUEST_REQUEST_RATE_LIMIT,
  },
  async ({ request, body }) =>
    toHttp(
      await requestCancellation().execute(
        { kind: "MANAGE_TOKEN", token: bearerToken(request.headers) },
        body,
      ),
      { ok: (row) => json(201, cancellationRequest(row)) },
    ),
);
