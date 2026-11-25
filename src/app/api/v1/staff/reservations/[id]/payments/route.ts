import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffReservationQueries } from "@/composition/reservations";

// API-S44. Amounts, status and refund progress; no card data, no provider payload.
export const GET = staffRoute(
  { route: "/api/v1/staff/reservations/[id]/payments" },
  async ({ staff, params }) =>
    toHttp(
      await staffReservationQueries().payments.execute(
        staff,
        String(params.id),
      ),
      {
        ok: ({ items }) =>
          json(200, {
            items: items.map((entry) => ({
              id: entry.id,
              status: entry.status,
              amountMinor: entry.amountMinor,
              currency: entry.currency,
              providerTransactionId: entry.providerTransactionId,
              refundAttempt: entry.refundAttempt,
              refundRequestedAt: entry.refundRequestedAt?.toISOString() ?? null,
              refundedAt: entry.refundedAt?.toISOString() ?? null,
              createdAt: entry.createdAt.toISOString(),
            })),
          }),
      },
    ),
);
