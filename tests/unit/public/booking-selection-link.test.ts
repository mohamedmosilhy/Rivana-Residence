import { describe, expect, it } from "vitest";

import { readDetailsQuery } from "@/app/(marketing)/[branch]/book/details/details-query";
import {
  bookingDetailsHref,
  bookingResultsHref,
  decodeSelection,
  encodeSelection,
} from "@/presentation/features/booking/selection-link";

const stay = { checkIn: "2026-12-03", checkOut: "2026-12-05" };
const lines = [
  { roomSlug: "deluxe-double", occupancy: { adults: 2, children: 0 } },
  { roomSlug: "studio", occupancy: { adults: 3, children: 2 } },
  { roomSlug: "studio", occupancy: { adults: 1, children: 1 } },
];
const u = "deluxe-double.2.0,studio.3.2,studio.1.1";

describe("selection addresses", () => {
  it("round trips the units, repeats included", () => {
    expect(encodeSelection(lines)).toBe(u);
    expect(decodeSelection(u)).toEqual(lines);
  });

  it.each([
    "",
    "studio",
    "studio.2",
    "studio.2.0.1",
    "studio.two.0",
    "studio.-1.0",
    "studio.100.0",
    ".2.0",
    "studio.2.0,",
  ])("rejects the malformed value %j", (value) => {
    expect(decodeSelection(value)).toBeNull();
  });

  it("builds the details address from dates and units only", () => {
    const href = new URL(
      bookingDetailsHref("new-cairo", stay, lines),
      "https://example.test",
    );
    expect(href.pathname).toBe("/new-cairo/book/details");
    expect([...href.searchParams.keys()]).toEqual(["checkIn", "checkOut", "u"]);
  });

  it("searches the results for the smallest party, so every selected unit stays listed", () => {
    const query = new URL(
      bookingResultsHref("new-cairo", stay, lines, "unavailable"),
      "https://example.test",
    ).searchParams;
    expect(Object.fromEntries(query)).toEqual({
      ...stay,
      adults: "1",
      children: "0",
      u,
      notice: "unavailable",
    });
  });

  it("refills the dates, or nothing, when the selection cannot be read", () => {
    expect(bookingResultsHref("new-cairo", stay, [], "selection")).toBe(
      "/new-cairo/book?checkIn=2026-12-03&checkOut=2026-12-05&adults=1&children=0&notice=selection",
    );
    expect(bookingResultsHref("new-cairo", null, [], "selection")).toBe(
      "/new-cairo/book?notice=selection",
    );
  });
});

describe("details page query", () => {
  it("accepts dates and up to five units", () => {
    expect(readDetailsQuery({ ...stay, u })).toEqual({
      ok: true,
      stay,
      lines,
    });
  });

  it.each([
    ["no units", undefined],
    ["a repeated value", [u, u]],
    ["six units", Array(6).fill("studio.1.0").join(",")],
    ["no adult", "studio.0.0"],
    ["a malformed unit", "studio.2"],
    ["a name that is not a listing address", "Studio%20A.1.0"],
    ["markup", "<script>.1.0"],
  ])("keeps only the dates for %s", (_name, value) => {
    expect(readDetailsQuery({ ...stay, u: value })).toEqual({
      ok: false,
      stay,
    });
  });

  it.each([
    { u },
    { checkIn: "2026-12-03", u },
    { checkIn: "2026-12-05", checkOut: "2026-12-03", u },
    { checkIn: "2026-02-30", checkOut: "2026-03-02", u },
    { checkIn: ["2026-12-03", "2026-12-04"], checkOut: "2026-12-05", u },
  ])("keeps nothing without usable dates (%j)", (query) => {
    expect(readDetailsQuery(query)).toEqual({ ok: false, stay: null });
  });
});
