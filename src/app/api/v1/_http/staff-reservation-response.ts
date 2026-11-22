import type { StaffReservationView } from "@/application/reservations";
import { staffReservation } from "../_dto/reservations";
import { json } from "./routes";

export function staffReservationUpdated(
  reservation: StaffReservationView,
  setBranch: (branchId: string) => void,
) {
  setBranch(reservation.branchId);
  return json(200, staffReservation(reservation), {
    ETag: `"v${reservation.version}"`,
  });
}
