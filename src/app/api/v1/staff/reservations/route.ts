import { staffReservation } from "@/app/api/v1/_dto/reservations";
import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import {
  staffReservationCommands,
  staffReservationQueries,
} from "@/composition/reservations";
import {
  CreateStaffReservationRequest,
  StaffReservationQuery,
} from "@/contracts/api/v1/reservations";

const route = "/api/v1/staff/reservations";

export const GET = staffRoute(
  { route, query: StaffReservationQuery },
  async ({ staff, query }) => {
    return toHttp(await staffReservationQueries().list.execute(staff, query), {
      ok: (page) => json(200, page),
    });
  },
);

export const POST = staffRoute(
  { route, body: CreateStaffReservationRequest },
  async ({ staff, body, request, setBranch }) => {
    return toHttp(
      await staffReservationCommands().create.execute(
        staff,
        body,
        request.headers.get("Idempotency-Key"),
      ),
      {
        ok: ({ reservation, replayed }) => {
          setBranch(reservation.branchId);
          return json(
            replayed ? 200 : 201,
            staffReservation(reservation),
            replayed
              ? undefined
              : { Location: `/api/v1/staff/reservations/${reservation.id}` },
          );
        },
      },
    );
  },
);
