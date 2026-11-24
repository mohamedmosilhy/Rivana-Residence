import { cancellationRequest } from "@/app/api/v1/_dto/guests";
import { bearerToken, json, publicRoute, toHttp } from "@/app/api/v1/_http";
import { GUEST_REQUEST_RATE_LIMIT } from "@/application/shared/public-rate-limit-policy";
import { requestCancellation } from "@/composition/guests";
import { CreateCancellationRequest } from "@/contracts/api/v1/guests";

// API-G4. The reference must belong to the verified phone.
export const POST = publicRoute(
  {
    route: "/api/v1/guest/reservations/[reference]/cancellation-requests",
    body: CreateCancellationRequest,
    bodyOptional: true,
    rateLimit: GUEST_REQUEST_RATE_LIMIT,
  },
  async ({ request, params, body }) =>
    toHttp(
      await requestCancellation().execute(
        {
          kind: "GUEST_SESSION",
          token: bearerToken(request.headers),
          reference: params.reference,
        },
        body,
      ),
      { ok: (row) => json(201, cancellationRequest(row)) },
    ),
);
