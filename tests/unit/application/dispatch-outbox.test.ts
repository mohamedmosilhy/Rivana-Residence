import { describe, expect, it, vi } from "vitest";

import {
  DispatchOutbox,
  type ClaimedMessage,
  type Completion,
} from "@/application/notifications";

// Regression: the manage link is built from APP_URL, which development and
// staging set to localhost or an IP. It must not be refused as an invalid
// message (that failure is final and scrubs the only copy of the link).
function run(manageLink: string | undefined, channel: "EMAIL" | "WHATSAPP") {
  const message: ClaimedMessage = {
    id: "m1",
    channel,
    recipient: channel === "EMAIL" ? "guest@example.test" : "+12025550101",
    kind: "reservation.confirmed",
    payload: {
      reference: "RR-00000001",
      branchName: "Hotel",
      ...(manageLink ? { manageLink } : {}),
    },
    attempts: 1,
  };
  const queue: (ClaimedMessage | null)[] = [message, null];
  const outcomes: Completion[] = [];
  const store = {
    claim: async () => queue.shift() ?? null,
    complete: async (_m: ClaimedMessage, outcome: Completion) => {
      outcomes.push(outcome);
      return true;
    },
  };
  const sent = { ok: true } as const;
  const dispatch = new DispatchOutbox(
    store,
    { send: async () => sent },
    { send: async () => sent } as never,
    { now: () => new Date("2031-01-01T00:00:00Z") },
  );
  return dispatch.run().then(() => outcomes);
}

describe("DispatchOutbox manage link", () => {
  it.each([
    "https://rivanaresidence.com/reservations/manage#t=abc",
    "http://localhost:3000/reservations/manage#t=abc",
    "http://127.0.0.1:3200/reservations/manage#t=abc",
  ])("accepts %s", async (link) => {
    for (const channel of ["EMAIL", "WHATSAPP"] as const) {
      expect(await run(link, channel)).toMatchObject([{ status: "SENT" }]);
    }
  });

  it.each(["javascript:alert(1)", "ftp://example.test/x", "not a url"])(
    "still refuses %s",
    async (link) => {
      expect(await run(link, "EMAIL")).toEqual([
        { status: "FAILED", lastError: "INVALID_MESSAGE" },
      ]);
    },
  );
});

describe("DispatchOutbox payment refund messages (M9-T5)", () => {
  async function dispatch(
    kind: string,
    channel: "EMAIL" | "WHATSAPP",
    recipient: string,
  ) {
    const queue: (ClaimedMessage | null)[] = [
      {
        id: "m1",
        channel,
        recipient,
        kind,
        payload: {
          reference: "RR-00000001",
          branchName: "Hotel",
          refundAmount: "USD 345.00",
        },
        attempts: 1,
      },
      null,
    ];
    const outcomes: Completion[] = [];
    const whatsapp = { send: vi.fn(async () => ({ ok: true }) as const) };
    await new DispatchOutbox(
      {
        claim: async () => queue.shift() ?? null,
        complete: async (_m: ClaimedMessage, outcome: Completion) => {
          outcomes.push(outcome);
          return true;
        },
      },
      { send: async () => ({ ok: true }) as const },
      whatsapp as never,
      { now: () => new Date("2031-01-01T00:00:00Z") },
    ).run();
    return { outcomes, whatsapp };
  }

  it("sends the auto refund notice by WhatsApp with the refund purpose", async () => {
    const { outcomes, whatsapp } = await dispatch(
      "payment.auto-refunded",
      "WHATSAPP",
      "+12025550101",
    );
    expect(outcomes).toMatchObject([{ status: "SENT" }]);
    expect(whatsapp.send).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "REFUND_COMPLETED",
        variables: expect.objectContaining({ refundAmount: "USD 345.00" }),
      }),
    );
  });

  it("keeps the staff alert email only", async () => {
    expect(
      (await dispatch("payment.staff-alert", "EMAIL", "hotel@example.test"))
        .outcomes,
    ).toMatchObject([{ status: "SENT" }]);
    const whatsapp = await dispatch(
      "payment.staff-alert",
      "WHATSAPP",
      "+12025550101",
    );
    expect(whatsapp.outcomes).toEqual([
      { status: "FAILED", lastError: "INVALID_MESSAGE" },
    ]);
    expect(whatsapp.whatsapp.send).not.toHaveBeenCalled();
  });

  it.each([
    ["cancellation-request.approved", "CANCELLATION_APPROVED"],
    ["cancellation-request.rejected", "CANCELLATION_REJECTED"],
    ["payment.refunded", "REFUND_COMPLETED"],
  ])("sends %s by WhatsApp with the %s purpose", async (kind, purpose) => {
    const { outcomes, whatsapp } = await dispatch(
      kind,
      "WHATSAPP",
      "+12025550101",
    );
    expect(outcomes).toMatchObject([{ status: "SENT" }]);
    expect(whatsapp.send).toHaveBeenCalledWith(
      expect.objectContaining({ purpose }),
    );
  });

  it.each([
    "refund.staff-alert",
    "payment.duplicate-alert",
    "refund.moved-on-alert",
  ])("keeps %s email only", async (kind) => {
    expect(
      (await dispatch(kind, "EMAIL", "hotel@example.test")).outcomes,
    ).toMatchObject([{ status: "SENT" }]);
    const whatsapp = await dispatch(kind, "WHATSAPP", "+12025550101");
    expect(whatsapp.outcomes).toEqual([
      { status: "FAILED", lastError: "INVALID_MESSAGE" },
    ]);
    expect(whatsapp.whatsapp.send).not.toHaveBeenCalled();
  });
});
