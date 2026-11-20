import type { z } from "zod";

import type { WebsiteReservationResult } from "@/application/reservations";
import type {
  WebsiteReservationCreated,
  WebsiteReservationReplayed,
} from "@/contracts/api/v1/reservations";

type Created = z.infer<typeof WebsiteReservationCreated>;
type Replayed = z.infer<typeof WebsiteReservationReplayed>;

/** The plain manage link, shown once (spec 0005 Decision 4). */
export const manageUrl = (token: string) => `/reservations/manage#t=${token}`;

/** A fresh booking, or the replay of one: never a repeated manage link. */
export function reservationResponse(
  result: WebsiteReservationResult,
):
  | Readonly<{ status: 201; body: Created }>
  | Readonly<{ status: 200; body: Replayed }> {
  if (result.replayed || result.manageToken === null)
    return {
      status: 200,
      body: {
        reference: result.reference,
        status: result.status,
        manageUrl: null,
      },
    };
  // A fresh pay at hotel booking is always CONFIRMED with a priced snapshot.
  // Anything else is a programming error, not a $0 booking to report.
  if (result.status !== "CONFIRMED" || result.totalMinor === null)
    throw new Error("A new website booking must be confirmed and priced.");
  return {
    status: 201,
    body: {
      reference: result.reference,
      status: result.status,
      total: { amountMinor: result.totalMinor, currency: "USD" },
      manageUrl: manageUrl(result.manageToken),
    },
  };
}
