import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { displayTime } from "@/presentation/features/booking/display-date";
import {
  StayDates,
  type StayTimes,
} from "@/presentation/features/booking/stay-dates";

import { stayTimes } from "./booking-extras-fixtures";

it.each([
  ["00:00", "12:00 AM"],
  ["00:30", "12:30 AM"],
  ["09:05", "9:05 AM"],
  ["11:59", "11:59 AM"],
  ["12:00", "12:00 PM"],
  ["14:00", "2:00 PM"],
  ["23:30", "11:30 PM"],
])("writes %s as %s", (stored, shown) => {
  expect(displayTime(stored)).toBe(shown);
});

const none: StayTimes = {
  checkInTime: null,
  checkInUntilTime: null,
  checkOutTime: null,
  checkOutFromTime: null,
};

const show = (times: StayTimes) => {
  render(
    <dl>
      <StayDates
        stay={{ checkIn: "2026-11-27", checkOut: "2026-11-29" }}
        times={times}
      />
    </dl>,
  );
  return screen.getAllByRole("definition").map((item) => item.textContent);
};

it.each<[string, StayTimes, string[]]>([
  [
    "both windows",
    stayTimes,
    [
      "Fri, 27 Nov 2026",
      "2:00 PM – 11:30 PM",
      "Sun, 29 Nov 2026",
      "12:00 AM – 11:30 AM",
    ],
  ],
  [
    "only the main times",
    { ...none, checkInTime: "14:00", checkOutTime: "11:30" },
    ["Fri, 27 Nov 2026", "From 2:00 PM", "Sun, 29 Nov 2026", "Until 11:30 AM"],
  ],
  [
    "no check-out time",
    { ...none, checkInTime: "14:00" },
    ["Fri, 27 Nov 2026", "From 2:00 PM", "Sun, 29 Nov 2026"],
  ],
  ["no times", none, ["Fri, 27 Nov 2026", "Sun, 29 Nov 2026"]],
  [
    "a branch saved without the window fields",
    { checkInTime: "14:00", checkOutTime: "11:30" } as StayTimes,
    ["Fri, 27 Nov 2026", "From 2:00 PM", "Sun, 29 Nov 2026", "Until 11:30 AM"],
  ],
])("shows the dates with %s", (_case, times, lines) => {
  expect(show(times)).toEqual(lines);
});
