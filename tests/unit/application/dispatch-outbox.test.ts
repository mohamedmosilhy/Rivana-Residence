import { describe, expect, it } from "vitest";

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
