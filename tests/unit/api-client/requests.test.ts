import { afterEach, describe, expect, it, vi } from "vitest";

import {
  analyticsSessionId,
  applyChange,
  createReservation,
  getGuestReservation,
  previewChange,
  searchAvailability,
} from "@/presentation/api-client";

import {
  CALLS,
  TOKEN,
  booking,
  change,
  link,
  search,
  signedIn,
  total,
} from "./calls";
import { answer, resetBrowser, setPrivacy, stubFetch } from "./support";

// covers: M10-T1 request shapes, headers, success results and AC-13 (no token
// in a URL or the console).

afterEach(resetBrowser);

describe.each(CALLS)("$name", (call) => {
  it("sends the documented request, same origin and uncached", async () => {
    const wire = stubFetch(() => answer(call.statuses[0]!, { seen: true }));
    const result = await call.run();
    expect(result).toEqual({
      ok: true,
      status: call.statuses[0],
      data: { seen: true },
    });
    expect(wire.fetch).toHaveBeenCalledTimes(1);
    const sent = wire.sent();
    expect(sent.url).toBe(call.url);
    expect(sent.method).toBe(call.method);
    expect(sent.init).toMatchObject({
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
    });
    if (call.body !== undefined) expect(sent.body).toEqual(call.body);
    if (call.method === "GET") expect(sent.init.body).toBeUndefined();
    expect(sent.headers["Content-Type"]).toBe(
      sent.init.body === undefined ? undefined : "application/json",
    );
    expect(sent.headers.Authorization).toBe(
      call.guest ? `Bearer ${TOKEN}` : undefined,
    );
    expect(sent.headers["Rivana-Analytics-Session"]).toBe(
      call.tracked ? analyticsSessionId() : undefined,
    );
  });

  it("keeps tokens out of the URL and writes nothing to the console", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(
      (method) => vi.spyOn(console, method),
    );
    const wire = stubFetch(() => answer(500, "<html>"));
    await call.run();
    expect(wire.sent().url).not.toContain(TOKEN);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("sends no visit id when tracking is refused", async () => {
    setPrivacy("globalPrivacyControl", true);
    const wire = stubFetch(() => answer(call.statuses[0]!, {}));
    await call.run();
    expect(wire.sent().headers["Rivana-Analytics-Session"]).toBeUndefined();
    expect(wire.sent().init.body ?? "").not.toContain("analyticsSessionId");
  });
});

describe("P7 booking", () => {
  it("sends the key as a header and attaches the tab's visit id", async () => {
    const wire = stubFetch(() => answer(201, {}));
    await createReservation(booking, "key-12345678");
    expect(wire.sent().headers["Idempotency-Key"]).toBe("key-12345678");
    expect(wire.sent().body).toEqual({
      ...booking,
      analyticsSessionId: analyticsSessionId(),
    });
  });

  it("overrides a visit id a caller slipped in after an opt out", async () => {
    setPrivacy("doNotTrack", "1");
    const wire = stubFetch(() => answer(201, {}));
    await createReservation(
      { ...booking, analyticsSessionId: "a".repeat(32) } as typeof booking,
      "key-12345678",
    );
    expect(wire.sent().body).toEqual(booking);
  });

  it("tells a new booking from a replay, which has no manage link", async () => {
    const replay = {
      reference: "RR-ABCD2345",
      status: "CONFIRMED",
      manageUrl: null,
    };
    stubFetch(() => answer(200, replay));
    expect(await createReservation(booking, "key-12345678")).toEqual({
      ok: true,
      status: 200,
      data: replay,
    });
  });
});

describe("guest changes", () => {
  it("returns the preview's version and passes it back unchanged", async () => {
    const preview = { proposed: { total } };
    const wire = stubFetch(() => answer(200, preview, { ETag: 'W/"v3"' }));
    const seen = await previewChange(link, change);
    expect(seen).toEqual({
      ok: true,
      status: 200,
      data: preview,
      etag: 'W/"v3"',
    });
    if (!seen.ok) throw new Error("The preview failed.");
    await applyChange(link, seen.etag!, { ...change, expectedTotal: total });
    expect(wire.sent(1).headers["If-Match"]).toBe('W/"v3"');
  });

  it("keeps a change sent for approval apart from an applied one", async () => {
    stubFetch(() => answer(202, { id: "c1", status: "OPEN" }));
    expect(
      await applyChange(signedIn, '"v3"', { expectedTotal: total }),
    ).toMatchObject({ ok: true, status: 202, data: { status: "OPEN" } });
  });
});

describe("older browsers", () => {
  // Safari 16.4 is a Next.js target and has no `URLSearchParams.size`.
  it("keeps the search query without URLSearchParams.size", async () => {
    vi.spyOn(URLSearchParams.prototype, "size", "get").mockReturnValue(
      undefined as unknown as number,
    );
    const wire = stubFetch();
    await searchAvailability("new-cairo", search);
    expect(wire.sent().url).toBe(CALLS[0]!.url);
  });
});

describe("path values", () => {
  it("encodes a reference so it stays one path segment", async () => {
    const wire = stubFetch();
    await getGuestReservation({
      kind: "SESSION",
      token: TOKEN,
      reference: "a/../b?x=#y",
    });
    expect(wire.sent().url).toBe(
      "/api/v1/guest/reservations/a%2F..%2Fb%3Fx%3D%23y",
    );
  });

  it.each(["", ".", "..", "\uD800"])(
    "refuses %j without sending",
    async (reference) => {
      const wire = stubFetch();
      expect(
        await getGuestReservation({ kind: "SESSION", token: TOKEN, reference }),
      ).toMatchObject({ ok: false, problem: { code: "NOT_FOUND" } });
      expect(wire.fetch).not.toHaveBeenCalled();
    },
  );

  it.each(["", "two words", "line\nbreak", "رمز"])(
    "sends no Authorization header for the unusable token %j",
    async (token) => {
      const wire = stubFetch(() => answer(401, {}));
      await getGuestReservation({ kind: "MANAGE_LINK", token });
      expect(wire.sent().headers.Authorization).toBeUndefined();
    },
  );
});
