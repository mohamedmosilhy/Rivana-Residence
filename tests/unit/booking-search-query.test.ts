import { expect, it } from "vitest";

import { readStaySearchQuery } from "@/app/(marketing)/[branch]/book/search-query";

const criteria = {
  checkIn: "2027-02-26",
  checkOut: "2027-03-01",
  adults: "2",
  children: "0",
};

it("only submits when a stay field is present and keeps a valid preferred listing", () => {
  expect(
    readStaySearchQuery({ room: "deluxe-double", utm_source: "google" }),
  ).toEqual({
    values: { checkIn: "", checkOut: "", adults: "1", children: "0" },
    room: "deluxe-double",
    errors: {},
    input: null,
  });
});

it("passes stay inputs only and leaves semantic calendar and count checks to availability", () => {
  const query = readStaySearchQuery({
    ...criteria,
    checkIn: "2027-02-30",
    adults: "-1",
    children: "1.5",
    unitsRequested: "5",
    branch: "other",
  });
  expect(query.input).toEqual({
    checkIn: "2027-02-30",
    checkOut: "2027-03-01",
    adults: -1,
    children: 1.5,
  });
  expect(query.errors).toEqual({});
});

it("shows missing, malformed and repeated fields and drops invalid listing hints", () => {
  const query = readStaySearchQuery({
    checkIn: [criteria.checkIn, criteria.checkIn],
    adults: "0x10",
    children: "",
    room: ["deluxe-double", "another"],
  });
  expect(query.input).toBeNull();
  expect(query.room).toBeNull();
  expect(query.values.checkIn).toBe(criteria.checkIn);
  expect(query.errors).toEqual({
    checkIn: "Enter this value once.",
    checkOut: "Enter a check-out date.",
    adults: "Enter the number of adults.",
    children: "Enter the number of children.",
  });
});
