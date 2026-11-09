import "server-only";

import type {
  AssignmentWindow,
  ReservationConsumptionReader,
  SoldNightContribution,
} from "@/application/inventory";
import type { LocalDate } from "@/domain/shared/local-date";
import type { StayRange } from "@/domain/shared/stay-range";

/** M6 has no reservation persistence. M8 replaces this adapter. */
export class EmptyReservationConsumptionReader
  implements ReservationConsumptionReader
{
  async readSoldOnDates(_input: {
    branchId: string;
    roomTypeIds: readonly string[];
    nights: readonly LocalDate[];
  }): Promise<readonly SoldNightContribution[]> {
    void _input;
    return [];
  }

  async readFutureSold(_input: {
    branchId: string;
    roomTypeId: string;
    from: LocalDate;
  }): Promise<readonly SoldNightContribution[]> {
    void _input;
    return [];
  }

  async readAssignments(_input: {
    branchId: string;
    physicalRoomId: string;
    window: AssignmentWindow;
  }): Promise<readonly StayRange[]> {
    void _input;
    return [];
  }
}
