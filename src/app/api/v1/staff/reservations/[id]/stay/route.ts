import { z } from "zod";

import { staffReservation } from "@/app/api/v1/_dto/reservations";
import {
  ifMatchVersion,
  json,
  staffRoute,
  toHttp,
  validate,
} from "@/app/api/v1/_http";
import { failure } from "@/application/shared/result";
import { staffReservationCommands } from "@/composition/reservations";
import { ModifyReservationStayRequest } from "@/contracts/api/v1/reservations";

export const PUT = staffRoute(
  {
    route: "/api/v1/staff/reservations/[id]/stay",
    body: z.unknown(),
  },
  async ({ staff, params, body, request, setBranch }) => {
    const checked = validate(ModifyReservationStayRequest, body);
    return toHttp(
      await staffReservationCommands().modify.execute(
        staff,
        String(params.id),
        ifMatchVersion(request),
        checked.ok
          ? checked.value
          : failure("VALIDATION", "Check the change.", checked.fieldErrors),
      ),
      {
        ok: ({ reservation }) => {
          setBranch(reservation.branchId);
          return json(200, staffReservation(reservation), {
            ETag: `"v${reservation.version}"`,
          });
        },
      },
    );
  },
);
