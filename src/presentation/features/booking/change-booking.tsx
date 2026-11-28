"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { MoneyDto } from "@/contracts/api/v1/primitives";
import {
  applyChange,
  getGuestReservation,
  previewChange,
  type GuestAccess,
} from "@/presentation/api-client/guest";
import { listBranchListings } from "@/presentation/api-client/listings";
import type { ApiProblem } from "@/presentation/api-client/result";
import { formatMoney } from "@/presentation/format/money";
import {
  bookingHeading,
  button,
  figures,
  link,
} from "@/presentation/site/classes";

import { BookingDetails, type BookingDetail } from "./booking-details";
import { ChangeForm, type Listings } from "./change-form";
import {
  changeFailure,
  type ChangeFailure,
  type ClosedReason,
} from "./change-problems";
import { ChangeReview, type Priced } from "./change-review";
import {
  changeFacts,
  changeField,
  changeInput,
  checkChange,
  prefillChange,
  type ChangeError,
  type ChangeForm as Form,
  type ChangeInput,
} from "./change-state";
import { CheckAgain, longestTimer } from "./check-again";
import { forgetManageToken } from "./guest-access-store";
import { HotelContact } from "./hotel-contact";
import type { ChangeOptions } from "./hotel-contacts";
import type { ServiceKind } from "./extras-state";
import { serviceName } from "./extras-answer";
import type { StayTimes } from "./stay-dates";
import type { AccessRefusal } from "./use-guest-reservation";
import { waitText } from "./verification-state";

/** The booking the form was filled from. */
type Base = Readonly<{
  booking: BookingDetail;
  current: Priced["current"];
  form: Form;
  /** The version a change is checked against (`If-Match`). */
  etag: string;
}>;

/** A priced change and exactly what was asked for it. */
type Offer = Readonly<{
  input: ChangeInput;
  preview: Priced;
  etag: string;
}>;

type PriceRecheck =
  | Readonly<{ reason: "price"; previousTotal: MoneyDto }>
  | Readonly<{ reason: "availability" }>;

/** An email change can end the key the guest is using. */
type EndedAccess = "link" | "session" | null;

type Phase =
  | Readonly<{ name: "opening" }>
  | Readonly<{ name: "failed"; message: string; wait: number }>
  | Readonly<{ name: "closed"; reason: ClosedReason }>
  | Readonly<{ name: "form" }>
  | Readonly<{ name: "review"; offer: Offer; oldPrice: MoneyDto | null }>
  | Readonly<{ name: "applied"; booking: BookingDetail; ended: EndedAccess }>
  | Readonly<{ name: "requested"; totalMinor: number }>;

const closedText: Record<ClosedReason, string> = {
  STATUS: "This booking cannot be changed online now.",
  REQUEST_OPEN: "A request on this booking is waiting for the hotel.",
  DEADLINE_PASSED: "The time for online changes has passed.",
  // Says nothing about why: the hotel handles a blocked number.
  PHONE_BLOCKED: "Please contact the hotel to continue.",
};

const NOTHING_CHANGED =
  "Nothing has changed yet. Edit your booking, then check the price.";
const REFILLED =
  "This booking changed while you were editing. We loaded it again, so please make your changes once more.";
const NEW_DATES_TOO_CLOSE =
  "These new dates are too close to change online. Choose a later check-in, or contact the hotel.";
const NOT_FOUND =
  "We couldn’t make that change. Check what your booking shows now.";
const UNSURE =
  "We couldn’t confirm whether your change was made. Check what this page shows now before trying again.";

const waitMessage = (action: "preview" | "change", seconds: number) =>
  action === "preview"
    ? `Too many price checks. Try again in ${waitText(seconds * 1000)}.`
    : `The limit for booking changes has been reached. Try again in ${waitText(seconds * 1000)}, or contact the hotel.`;

type Wait = Readonly<{ seconds: number; text: string }>;

/** Calls `ended` once the wait the server asked for is over. */
function useWaitEnd(wait: Wait | null, ended: () => void) {
  const end = useEffectEvent(ended);
  useEffect(() => {
    if (!wait) return;
    const timer = setTimeout(
      () => end(),
      Math.min(wait.seconds * 1000, longestTimer),
    );
    return () => clearTimeout(timer);
  }, [wait]);
}

/** The server still offers a change for this booking. */
const changeable = (booking: BookingDetail) =>
  booking.allowedActions.includes("CHANGE_RESERVATION");

/**
 * Changes one booking (US-G6a): fill the form from the server, preview the new
 * price (API-G5), then confirm exactly that total (API-G6). Nothing is sent
 * twice by itself. Mount a new instance for another booking.
 */
export function ChangeBooking({
  access,
  booking,
  options,
  times,
  contactPage,
  emailSession,
  onClose,
  onRefused,
}: Readonly<{
  access: GuestAccess;
  /** The booking on screen when the change was opened. */
  booking: BookingDetail;
  options: ChangeOptions | null;
  times: StayTimes;
  contactPage: boolean;
  /** "My reservations" opened with an email code. */
  emailSession: boolean;
  /** Back to the booking, which is read again. */
  onClose: (notice: string | null) => void;
  onRefused: (refusal: AccessRefusal) => void;
}>) {
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>({ name: "opening" });
  const [base, setBase] = useState<Base | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<readonly ChangeError[]>([]);
  const [notice, setNotice] = useState<{ text: string } | null>(null);
  const [withdrawn, setWithdrawn] = useState<readonly ServiceKind[]>([]);
  const [listings, setListings] = useState<Listings>({ status: "loading" });
  const [listingRound, setListingRound] = useState(0);
  const [busy, setBusy] = useState(false);
  // The server limits previews and changes apart, so each waits on its own.
  const [previewWait, setPreviewWait] = useState<Wait | null>(null);
  const [changeWait, setChangeWait] = useState<Wait | null>(null);
  const sending = useRef(false);
  const mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  /** Said above the form once it has been filled again. */
  const refill = useRef<string | null>(null);
  const slug = booking.branch.slug;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (phase.name !== "form" && phase.name !== "review")
      heading.current?.focus();
  }, [phase.name]);

  useWaitEnd(previewWait, () => {
    setPreviewWait(null);
    // The only message left is the one about this wait.
    setErrors([]);
  });
  useWaitEnd(changeWait, () => setChangeWait(null));

  /** A failed read while the form is being filled. */
  function openingFailed(failed: ApiProblem) {
    const failure = changeFailure(failed, access.kind);
    if (failure.kind === "access") return onRefused(failure.refusal);
    if (failure.kind === "closed")
      return setPhase({ name: "closed", reason: failure.reason });
    if (failure.kind === "gone") return onClose(NOT_FOUND);
    const seconds = failure.kind === "wait" ? failure.seconds : 0;
    setPhase({
      name: "failed",
      message: seconds
        ? waitMessage("preview", seconds)
        : "We couldn’t open your booking for changes. Please try again.",
      wait: seconds,
    });
  }

  const open = useEffectEvent(async (signal: AbortSignal) => {
    // The preview first: if the booking changes between these two reads, the
    // next preview carries a newer version and the form is filled again.
    const preview = await previewChange(access, {}, { signal });
    if (signal.aborted) return;
    if (!preview.ok) return openingFailed(preview.problem);
    const read = await getGuestReservation(access, { signal });
    if (signal.aborted) return;
    if (!read.ok) return openingFailed(read.problem);
    if (!changeable(read.data)) return onClose(null);
    const { etag } = preview;
    if (!etag)
      return setPhase({
        name: "failed",
        message: "We couldn’t open your booking for changes. Please try again.",
        wait: 0,
      });
    const filled = prefillChange(preview.data.current, read.data);
    setBase({
      booking: read.data,
      current: preview.data.current,
      form: filled,
      etag,
    });
    setForm(filled);
    setErrors([]);
    setWithdrawn([]);
    setNotice(refill.current ? { text: refill.current } : null);
    refill.current = null;
    setPhase({ name: "form" });
  });

  useEffect(() => {
    const controller = new AbortController();
    // Deferred, so a mount that is undone at once sends nothing.
    const timer = setTimeout(() => void open(controller.signal), 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [round]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const result = await listBranchListings(slug, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setListings(
        result.ok
          ? { status: "loaded", items: result.data.items }
          : { status: "failed" },
      );
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [slug, listingRound]);

  function fillAgain(message: string) {
    refill.current = message;
    setPhase({ name: "opening" });
    setRound((value) => value + 1);
  }

  function backToForm(next: readonly ChangeError[], message?: string) {
    setErrors([...next]);
    setNotice(message ? { text: message } : null);
    setPhase({ name: "form" });
  }

  function lock(active: boolean) {
    sending.current = active;
    setBusy(active);
  }

  /** The new check-in is too late, or the whole booking now is. */
  async function deadlinePassed() {
    const read = await getGuestReservation(access);
    if (!mounted.current) return;
    if (!read.ok) {
      const failure = changeFailure(read.problem, access.kind);
      if (failure.kind === "access") return onRefused(failure.refusal);
    } else if (!changeable(read.data))
      return setPhase({ name: "closed", reason: "DEADLINE_PASSED" });
    backToForm([{ field: changeField.checkIn, message: NEW_DATES_TOO_CLOSE }]);
  }

  /** Refusals that mean the same after a preview and after a change. */
  async function refused(failure: ChangeFailure, input: ChangeInput) {
    switch (failure.kind) {
      case "access":
        return onRefused(failure.refusal);
      case "closed":
        if (failure.reason === "DEADLINE_PASSED" && input.stay)
          return deadlinePassed();
        return setPhase({ name: "closed", reason: failure.reason });
      case "stale":
        return fillAgain(REFILLED);
      case "fields":
        return backToForm(failure.errors);
      case "taken":
        return backToForm([
          {
            field: null,
            message:
              "These rooms or apartments are no longer available for these dates. Change your selection, then check again.",
          },
        ]);
      case "service": {
        const { service } = failure;
        const kept = base!.form;
        // An extra already booked goes back as it was; a new one comes off.
        setForm((held) =>
          service === "BREAKFAST"
            ? { ...held!, breakfast: kept.breakfast }
            : { ...held!, transfer: kept.transfer, cars: kept.cars },
        );
        setWithdrawn((held) => [...held, service]);
        const booked = service === "BREAKFAST" ? kept.breakfast : kept.transfer;
        return backToForm(
          [],
          booked
            ? `${serviceName[service]} can no longer be changed online, so it stays as you booked it. Contact the hotel to change it.`
            : `${serviceName[service]} is no longer available, so we removed it.`,
        );
      }
      case "gone":
        return onClose(NOT_FOUND);
      default:
        // The caller words waits and missing answers for its own step.
        return;
    }
  }

  async function check() {
    if (sending.current || previewWait || !base || !form) return;
    const wrong = checkChange(base.form, form);
    if (wrong.length > 0) return backToForm(wrong);
    const input = changeInput(base.form, form);
    if (!input) return backToForm([{ field: null, message: NOTHING_CHANGED }]);
    lock(true);
    setErrors([]);
    setNotice(null);
    await price(input);
    if (mounted.current) lock(false);
  }

  /** Preview the edits, including after a failed confirmation. */
  async function price(input: ChangeInput, recheck?: PriceRecheck) {
    const result = await previewChange(access, input);
    if (!mounted.current) return;
    if (!result.ok) {
      const failure = changeFailure(result.problem, access.kind);
      if (failure.kind === "wait") {
        const text = waitMessage("preview", failure.seconds);
        setPreviewWait({ seconds: failure.seconds, text });
        return backToForm([{ field: null, message: text }]);
      }
      if (failure.kind === "busy" || failure.kind === "unknown")
        return backToForm([
          {
            field: null,
            message: "We couldn’t check the new price. Please try again.",
          },
        ]);
      return refused(failure, input);
    }
    const { etag, data } = result;
    if (!etag)
      return backToForm([
        {
          field: null,
          message: "We couldn’t check the new price. Please try again.",
        },
      ]);
    if (etag !== base!.etag) return fillAgain(REFILLED);
    if (!data.available || !data.proposed)
      return backToForm(
        data.unavailableLines.length > 0
          ? [
              {
                field: null,
                message:
                  "Your change is not available. Change the dates or the marked units, then check again.",
              },
              ...data.unavailableLines.map((index) => ({
                field: changeField.unit(index),
                message: `Unit ${index + 1}, ${form!.units[index]?.roomName ?? "your selection"}, is not available for these dates.`,
              })),
            ]
          : [
              {
                field: null,
                message: "Your change is not available for these dates.",
              },
            ],
      );
    if (recheck?.reason === "availability")
      return backToForm(
        [],
        "Your selection is available again. Check the new price before confirming.",
      );

    setPhase({
      name: "review",
      offer: {
        input,
        etag,
        preview: {
          current: data.current,
          proposed: data.proposed,
          outcome: data.outcome,
        },
      },
      oldPrice: recheck?.previousTotal ?? null,
    });
  }

  async function confirm(offer: Offer) {
    if (sending.current || changeWait) return;
    lock(true);
    const { input, etag, preview } = offer;
    // No abort signal: leaving must not make a sent change unknown.
    const result = await applyChange(access, etag, {
      ...input,
      expectedTotal: preview.proposed.total,
    });
    if (!mounted.current) return;
    if (result.ok) {
      lock(false);
      if (result.status === 202)
        return setPhase({
          name: "requested",
          totalMinor: result.data.previewTotalMinor,
        });
      const ended = endedBy(input);
      if (ended === "link") forgetManageToken();
      return setPhase({ name: "applied", booking: result.data, ended });
    }
    const failure = changeFailure(result.problem, access.kind);
    switch (failure.kind) {
      case "price":
        // A fresh preview gives the new total and its version together.
        await price(input, {
          reason: "price",
          previousTotal: preview.proposed.total,
        });
        break;
      case "taken":
        // The preview can identify the affected units without another write.
        await price(input, { reason: "availability" });
        break;
      case "wait":
        setChangeWait({
          seconds: failure.seconds,
          text: waitMessage("change", failure.seconds),
        });
        break;
      case "busy":
        backToForm(
          [],
          "We couldn’t make the change just now. Check the new price again.",
        );
        break;
      case "unknown":
        onClose(UNSURE);
        break;
      default:
        await refused(failure, input);
    }
    if (mounted.current) lock(false);
  }

  /** Replacing the email revokes the private link (spec 0006, Decision 8). */
  function endedBy(input: ChangeInput): EndedAccess {
    // Destructured: the architecture test reads dotted access as a table.
    const { guest } = input;
    const email = guest?.email;
    const before = base!.booking.contact?.email;
    if (!email || !before || email.toLowerCase() === before.toLowerCase())
      return null;
    if (access.kind === "MANAGE_LINK") return "link";
    return emailSession ? "session" : null;
  }

  const back = (label: string) => (
    <button
      type="button"
      className={button("primary", "justify-self-start max-sm:w-full")}
      onClick={() => onClose(null)}
    >
      {label}
    </button>
  );
  const hotel = (
    <HotelContact contact={booking.branch} contactPage={contactPage} />
  );
  const title = (text: string) => (
    <h2 ref={heading} tabIndex={-1} className={bookingHeading}>
      {text}
    </h2>
  );
  const leave = (
    <button
      type="button"
      className={`${link} justify-self-start`}
      onClick={() => onClose(null)}
    >
      Back to my booking
    </button>
  );

  switch (phase.name) {
    case "opening":
      return (
        <div className="grid gap-4">
          {title("Change booking")}
          <p role="status" className="m-0">
            Loading your booking…
          </p>
          {leave}
        </div>
      );
    case "failed":
      return (
        <div className="grid gap-4">
          {title("Change booking")}
          <p role="alert" className="m-0">
            {phase.message}
          </p>
          <CheckAgain
            waitSeconds={phase.wait}
            onClick={() => {
              setPhase({ name: "opening" });
              setRound((value) => value + 1);
            }}
          />
          {leave}
          {hotel}
        </div>
      );
    case "closed":
      return (
        <div className="grid gap-4">
          {title("Contact the hotel about this change")}
          <p className="m-0">{closedText[phase.reason]}</p>
          {hotel}
          {back("Back to my booking")}
        </div>
      );
    case "requested":
      return (
        <div className="grid gap-4">
          {title("Sent to the hotel for approval")}
          <p className="m-0">
            Your booking has not changed yet. It stays as it is until the hotel
            decides.
          </p>
          <p className="m-0">
            Requested new total:{" "}
            <strong className={figures}>{formatMoney(phase.totalMinor)}</strong>
          </p>
          {back("Back to my booking")}
          {hotel}
        </div>
      );
    case "applied":
      return (
        <div className="grid gap-5">
          {title("Your booking was changed")}
          {phase.ended === "link" && (
            <p className="m-0">
              Your email changed, so this private link no longer works. Where we
              can, we send a new link to your phone. Otherwise use My
              reservations or contact the hotel.
            </p>
          )}
          {phase.ended === "session" && (
            <p className="m-0">
              This booking now uses your new email, so it leaves this list. Get
              a code for the new email to see it.
            </p>
          )}
          <BookingDetails booking={phase.booking} times={times} />
          {phase.ended === null && back("View my booking")}
          {phase.ended === "link" && (
            <Link
              href={"/reservations/find" as Route}
              prefetch={false}
              className={button("primary", "justify-self-start max-sm:w-full")}
            >
              My reservations
            </Link>
          )}
          {hotel}
        </div>
      );
  }

  if (!base || !form) return null;
  if (phase.name === "review")
    return (
      <ChangeReview
        preview={phase.offer.preview}
        facts={changeFacts(base.form, form)}
        payAtHotel={base.booking.paymentMethod === "PAY_AT_HOTEL"}
        oldPrice={phase.oldPrice}
        problem={changeWait}
        busy={busy}
        onAccept={() => setPhase({ ...phase, oldPrice: null })}
        onConfirm={() => void confirm(phase.offer)}
        onBack={() => backToForm([])}
      />
    );
  return (
    <ChangeForm
      booking={base.booking}
      current={base.current}
      value={form}
      listings={listings}
      options={options}
      withdrawn={withdrawn}
      errors={errors}
      notice={notice}
      busy={busy}
      waiting={previewWait !== null}
      onChange={(next) => {
        setForm(next);
        // A message names a unit by its place, which an edit can move.
        if (next.units !== form.units && errors.length > 0 && !previewWait)
          setErrors([]);
      }}
      onReloadListings={() => {
        setListings({ status: "loading" });
        setListingRound((value) => value + 1);
      }}
      onSubmit={() => void check()}
      onCancel={() => onClose(null)}
    />
  );
}
