import { z } from "zod";
import { changeRequest, guestReservation } from "@/app/api/v1/_dto/guests";
import {
  bearerToken,
  ifMatchVersion,
  json,
  publicRoute,
  toHttp,
  validate,
} from "@/app/api/v1/_http";
import { failure, success } from "@/application/shared/result";
import { GUEST_CHANGE_RATE_LIMIT } from "@/application/shared/public-rate-limit-policy";
import { guestReservationChanges } from "@/composition/guests";
import { ApplyGuestChangeInput } from "@/contracts/api/v1/guests";

export const POST = publicRoute(
  {
    route: "/api/v1/guest/reservation/changes",
    body: z.unknown(),
    rateLimit: GUEST_CHANGE_RATE_LIMIT,
  },
  async ({ request, body }) => {
    const checked = validate(ApplyGuestChangeInput, body);
    return toHttp(
      await guestReservationChanges().apply.execute(
        { kind: "MANAGE_TOKEN", token: bearerToken(request.headers) },
        ifMatchVersion(request),
        checked.ok
          ? success(checked.value)
          : failure("VALIDATION", "Check the change.", checked.fieldErrors),
      ),
      {
        ok: (result) => {
          const headers = { ETag: `"v${result.version}"` };
          if (result.kind === "REQUESTED")
            return json(202, changeRequest(result.request), headers);
          const { reservation } = result;
          return json(200, guestReservation(reservation), headers);
        },
      },
    );
  },
);
