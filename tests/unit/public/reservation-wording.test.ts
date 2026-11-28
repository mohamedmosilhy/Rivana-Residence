import { describe, expect, it } from "vitest";

import { REQUEST_REASON_MAX } from "@/domain/reservations";
import {
  CANCELLATION_REQUEST_STATUSES,
  RESERVATION_PAYMENT_STATUSES,
  RESERVATION_STATUSES,
} from "@/domain/shared/types";
import { REASON_LIMIT } from "@/presentation/features/booking/cancellation-request";
import {
  cancellationNote,
  changeNote,
  noCancellationReason,
  paymentStatusText,
  reservationStatusText,
} from "@/presentation/features/booking/reservation-wording";

import { cancellation, reservation } from "./guest-reservation-fixtures";

const before = Date.parse("2027-02-01T00:00:00Z");
const after = Date.parse("2027-03-01T00:00:00Z");
const blockedLooking = reservation({ allowedActions: [] });

describe("status words", () => {
  it("has its own words for every status the server knows", () => {
    for (const status of RESERVATION_STATUSES)
      expect(reservationStatusText(status)).not.toContain("_");
    for (const status of RESERVATION_PAYMENT_STATUSES) {
      const text = paymentStatusText(status);
      expect(text).not.toBe(status.replaceAll("_", " ").toLowerCase());
    }
    expect(reservationStatusText("NO_SHOW")).toBe("marked as not arrived");
    expect(reservationStatusText("NEW_STATE")).toBe("new state");
  });

  it("describes every cancellation request state without naming a provider", () => {
    for (const status of CANCELLATION_REQUEST_STATUSES) {
      const note = cancellationNote(
        reservation({ cancellationRequest: cancellation(status) }),
      );
      expect(note?.title).toBeTruthy();
      expect(JSON.stringify(note)).not.toMatch(/paymob|fake/i);
    }
    expect(cancellationNote(reservation())).toBeNull();
  });

  it("says the booking stays confirmed only while it is", () => {
    const open = (status: "CONFIRMED" | "CANCELLED") =>
      cancellationNote(
        reservation({
          status,
          cancellationRequest: cancellation("REJECTED", "Too late."),
        }),
      )!.lines;
    expect(open("CONFIRMED")).toEqual([
      "Your booking is still confirmed.",
      "The hotel’s note: Too late.",
    ]);
    expect(open("CANCELLED")).toEqual(["The hotel’s note: Too late."]);
  });

  it("reports a completed refund only when the payment says so", () => {
    const completed = (paymentStatus: string) =>
      cancellationNote(
        reservation({
          status: "CANCELLED",
          paymentStatus,
          cancellationRequest: cancellation("COMPLETED"),
        }),
      )!.lines.join(" ");
    expect(completed("REFUNDED")).toContain("refunded");
    expect(completed("NOT_REQUIRED")).not.toContain("refunded");
  });

  it.each([
    ["OPEN", "Change sent to the hotel", /\$150\.00/],
    ["APPROVED", "Change approved", /approved change/],
    ["REJECTED", "Change declined", /not changed/],
    ["CLOSED", "Change request closed", /no longer open/],
  ] as const)("describes a %s change request", (status, title, line) => {
    const note = changeNote(
      reservation({
        changeRequest: {
          id: "change-1",
          status,
          createdAt: "2026-11-02T10:00:00.000Z",
          previewTotalMinor: 15000,
          decisionReason: null,
          closedReason: null,
        },
      }),
    )!;
    expect(note.title).toBe(title);
    expect(note.lines.join(" ")).toMatch(line);
  });
});

describe("why there is no cancellation button", () => {
  it("names the closed deadline in hotel time, from that moment on", () => {
    const deadline = Date.parse(blockedLooking.cancellationDeadline!);
    expect(noCancellationReason(blockedLooking, deadline)).toMatch(
      /Sunday,? 28 February 2027 at 14:00/,
    );
    expect(noCancellationReason(blockedLooking, after)).toContain("closed on");
    expect(noCancellationReason(blockedLooking, deadline - 1)).toBe(
      "To change or cancel this booking, contact the hotel.",
    );
  });

  it("never mentions a blocked number", () => {
    expect(noCancellationReason(blockedLooking, before)).not.toMatch(/block/i);
  });

  it("explains an open change request and a refund", () => {
    const changing = reservation({
      allowedActions: [],
      changeRequest: {
        id: "change-1",
        status: "OPEN",
        createdAt: "2026-11-02T10:00:00.000Z",
        previewTotalMinor: 15000,
        decisionReason: null,
        closedReason: null,
      },
    });
    expect(noCancellationReason(changing, before)).toContain("change request");
    expect(
      noCancellationReason(
        reservation({ allowedActions: [], paymentStatus: "REFUND_PENDING" }),
        before,
      ),
    ).toContain("refund is in progress");
  });

  it.each(["OPEN", "APPROVED", "REFUND_PENDING", "REFUND_FAILED"] as const)(
    "leaves a %s request to explain itself",
    (status) => {
      expect(
        noCancellationReason(
          reservation({
            allowedActions: [],
            cancellationRequest: cancellation(status),
          }),
          after,
        ),
      ).toBeNull();
    },
  );

  it("says nothing for a booking that is not confirmed", () => {
    expect(
      noCancellationReason(reservation({ status: "CANCELLED" }), after),
    ).toBeNull();
  });
});

it("limits a reason as the server does", () => {
  expect(REASON_LIMIT).toBe(REQUEST_REASON_MAX);
});
