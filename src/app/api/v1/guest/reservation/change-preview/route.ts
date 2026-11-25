import { z } from "zod";
import {
  bearerToken,
  json,
  publicRoute,
  toHttp,
  validate,
} from "@/app/api/v1/_http";
import { failure, success } from "@/application/shared/result";
import { GUEST_CHANGE_PREVIEW_RATE_LIMIT } from "@/application/shared/public-rate-limit-policy";
import { guestReservationChanges } from "@/composition/guests";
import { GuestChangeInput } from "@/contracts/api/v1/guests";

export const POST = publicRoute(
  {
    route: "/api/v1/guest/reservation/change-preview",
    body: z.unknown(),
    rateLimit: GUEST_CHANGE_PREVIEW_RATE_LIMIT,
  },
  async ({ request, body }) => {
    const checked = validate(GuestChangeInput, body);
    return toHttp(
      await guestReservationChanges().preview.execute(
        { kind: "MANAGE_TOKEN", token: bearerToken(request.headers) },
        checked.ok
          ? success(checked.value)
          : failure("VALIDATION", "Check the change.", checked.fieldErrors),
      ),
      {
        ok: ({ version, preview }) =>
          json(200, preview, { ETag: `"v${version}"` }),
      },
    );
  },
);
