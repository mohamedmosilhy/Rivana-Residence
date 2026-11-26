import { describe, expect, it } from "vitest";

import { AnalyticsEventRequest } from "@/contracts/api/v1/analytics";
import {
  deviceFor,
  funnelStepFor,
  omitSiteEvent,
  publicPage,
  summarizeSiteSessions,
  trafficLabels,
} from "@/domain/analytics";
import { parseServerEnv } from "@/lib/env/schema";

const path = "/new-cairo/stay/room";
const sessionId = "a".repeat(32);
const pageView = { name: "PAGE_VIEW", path } as const;

describe("T-ANL-1 and T-ANL-4: fixed browser events and activation", () => {
  it("accepts only page and named step views, at most twenty per batch", () => {
    expect(
      AnalyticsEventRequest.safeParse({
        sessionId,
        events: Array(20).fill(pageView),
      }).success,
    ).toBe(true);
    expect(
      AnalyticsEventRequest.safeParse({
        sessionId,
        events: [{ name: "STEP_VIEW", path, step: "SEARCH" }],
      }).success,
    ).toBe(true);
    expect(
      AnalyticsEventRequest.safeParse({ sessionId, events: [] }).success,
    ).toBe(true);
    for (const events of [
      Array(21).fill(pageView),
      [{ ...pageView, step: "SEARCH" }],
      [{ name: "STEP_VIEW", path }],
      [{ name: "STEP_VIEW", path, step: "OTHER" }],
      [{ name: "BOOKING_CONFIRMED", path }],
      [{ ...pageView, path: "bad" }],
      [{ ...pageView, path: "/" + "a".repeat(200) }],
      [{ ...pageView, utm: { guestName: "anyone" } }],
      [{ ...pageView, visitorHash: "abc" }],
    ]) {
      expect(
        AnalyticsEventRequest.safeParse({ sessionId, events }).success,
      ).toBe(false);
    }
    expect(
      AnalyticsEventRequest.safeParse({ sessionId: "bad", events: [pageView] })
        .success,
    ).toBe(false);
    expect(
      AnalyticsEventRequest.safeParse({
        sessionId,
        events: [pageView],
        email: "person@example.test",
      }).success,
    ).toBe(false);
  });

  it("requires explicit activation, even when the environment is production", () => {
    const prod = {
      NODE_ENV: "production",
      APP_URL: "https://example.test",
      DATABASE_URL: "postgresql://localhost/app",
      BETTER_AUTH_SECRET: "analytics-environment-test-secret-only",
      MEDIA_STORAGE_ROOT: "/tmp/rivana-media",
    };
    expect(parseServerEnv(prod).ANALYTICS_ENABLED).toBe(false);
    expect(
      parseServerEnv({ ...prod, ANALYTICS_ENABLED: "true" }).ANALYTICS_ENABLED,
    ).toBe(true);
  });
});

describe("T-ANL-2 and T-ANL-3: page and session funnel rules", () => {
  it("normalizes paths to fixed patterns and strips all query and fragment values", () => {
    expect(publicPage(path + "?token=bad#secret")).toEqual({
      path: "/{branch}/stay/[slug]",
      branchSlug: "new-cairo",
      roomSlug: "room",
    });
    expect(publicPage("/reservations/manage#token")).toEqual({
      path: "/reservations/manage",
      branchSlug: null,
      roomSlug: null,
    });
    expect(publicPage("/new-cairo/facilities/spa/")?.path).toBe(
      "/{branch}/facilities/[slug]",
    );
    for (const invalid of [
      "//example.test",
      "/admin",
      "/new-cairo/accounts/x",
      "/new-cairo/stay/a%2fb",
    ]) {
      expect(publicPage(invalid)).toBeNull();
    }
  });

  it("maps the eight stages and keeps anonymous demand and refusal outside the funnel", () => {
    expect(
      funnelStepFor({
        name: "PAGE_VIEW",
        path: "/{branch}/stay/[slug]",
        roomId: "room",
      }),
    ).toBe(2);
    expect(
      funnelStepFor({ name: "PAGE_VIEW", path: "/{branch}/stay/[slug]" }),
    ).toBe(1);
    expect(
      funnelStepFor({
        name: "STEP_VIEW",
        path: "/{branch}/book",
        step: "SEARCH",
      }),
    ).toBe(3);
    expect(
      funnelStepFor({
        name: "STEP_VIEW",
        path: "/{branch}/book/details",
        step: "SEARCH",
      }),
    ).toBeNull();
    expect(funnelStepFor({ name: "SEARCH" })).toBeNull();
    expect(funnelStepFor({ name: "SEARCH", sessionId })).toBe(3);
    expect(
      [
        "QUOTE",
        "CODE_REQUESTED",
        "PHONE_VERIFIED",
        "BOOKING_SUBMITTED",
        "BOOKING_CONFIRMED",
        "CHECKOUT_REFUSED",
      ].map((name) =>
        funnelStepFor({
          name: name as
            | "QUOTE"
            | "CODE_REQUESTED"
            | "PHONE_VERIFIED"
            | "BOOKING_SUBMITTED"
            | "BOOKING_CONFIRMED"
            | "CHECKOUT_REFUSED",
        }),
      ),
    ).toEqual([4, 5, 6, 7, 8, null]);
  });

  it("uses the last inserted page view when timestamps tie", () => {
    const page = {
      occurredAt: new Date("2026-11-26T12:00:00Z"),
      sessionId,
      name: "PAGE_VIEW" as const,
      funnelStep: 1,
    };
    expect(
      summarizeSiteSessions([
        { ...page, id: 12n, path: "/{branch}/book" },
        { ...page, id: 11n, path: "/{branch}/stay" },
      ])[0]?.exitPage,
    ).toBe("/{branch}/book");
  });

  it("deduplicates steps, splits at exactly 30 minutes and uses the last viewed page as the exit page", () => {
    const event = (minutes: number, page: string, step: number) => ({
      id: BigInt(minutes),
      occurredAt: new Date(minutes * 60_000),
      sessionId,
      name: "PAGE_VIEW" as const,
      path: page,
      funnelStep: step,
    });
    expect(
      summarizeSiteSessions([
        event(59, "/{branch}", 1),
        event(29, "/{branch}/book", 1),
        event(0, "/{branch}/stay/[slug]", 2),
        event(1, "/{branch}/stay/[slug]", 2),
        { ...event(30, "/ignored", 1), sessionId: null },
        { ...event(60, "", 8), name: "BOOKING_CONFIRMED", path: null },
      ]),
    ).toEqual([
      {
        sessionId,
        reachedSteps: [1, 2],
        furthestStep: 2,
        dropOffStep: 2,
        exitPage: "/{branch}/book",
      },
      {
        sessionId,
        reachedSteps: [1, 8],
        furthestStep: 8,
        dropOffStep: null,
        exitPage: null,
      },
    ]);
  });
});

describe("T-ANL-5 and T-ANL-6: privacy", () => {
  it("retains only approved traffic labels", () => {
    expect(
      trafficLabels({
        ...pageView,
        referrer: "https://www.google.com/search?p=secret@example.test#token",
        utm: {
          source: " Google ",
          medium: "cpc",
          campaign: "secret@example.test",
        },
      }),
    ).toEqual({
      referrerHost: "www.google.com",
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: null,
    });
    for (const referrer of [
      "https://person.google.com",
      "https://www.google.com.example.test",
      "https://secret@www.google.com",
      "https://evil.test/?www.google.com",
    ]) {
      expect(trafficLabels({ ...pageView, referrer }).referrerHost).toBeNull();
    }
  });

  it.each([
    ["sec-gpc", "1"],
    ["dnt", "1"],
    ["next-router-prefetch", "1"],
    ["next-router-segment-prefetch", "/_tree"],
    ["purpose", "prefetch"],
    ["sec-purpose", "prefetch;prerender"],
    ["user-agent", "Googlebot/2.1"],
  ])("drops %s %s", (name, value) => {
    expect(omitSiteEvent(new Headers({ [name]: value }))).toBe(true);
  });

  it("uses only three device classes and accepts ordinary traffic", () => {
    expect(
      omitSiteEvent(new Headers({ "user-agent": "Mozilla/5.0", dnt: "0" })),
    ).toBe(false);
    expect(deviceFor("Android Mobile")).toBe("MOBILE");
    expect(deviceFor("Android Tablet")).toBe("TABLET");
    expect(deviceFor("Desktop browser")).toBe("DESKTOP");
  });
});
