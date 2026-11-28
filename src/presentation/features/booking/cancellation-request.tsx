"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  requestCancellation,
  type GuestAccess,
} from "@/presentation/api-client/guest";
import type { ApiProblem } from "@/presentation/api-client/result";
import {
  alertBox,
  button,
  fieldControl,
  fieldError,
  fieldGroup,
  fieldHelp,
  fieldLabel,
} from "@/presentation/site/classes";

import { longestTimer } from "./check-again";
import { CONTROL, HIDDEN } from "./guest-details";
import { accessRefusal, type AccessRefusal } from "./use-guest-reservation";
import { waitText } from "./verification-state";

// Repeats the domain's `REQUEST_REASON_MAX`, which stays out of the browser;
// a unit test keeps the two in step.
export const REASON_LIMIT = 500;

/** What is said above the booking once the server has to be asked again. */
function settledMessage(problem: ApiProblem) {
  switch (problem.code) {
    case "CANCELLATION_WINDOW_CLOSED":
      return "Online cancellation has closed for this booking. Your request was not sent.";
    case "CANCELLATION_REQUEST_EXISTS":
      return "This booking already has a request. A new one was not sent.";
    case "INVALID_TRANSITION":
      return "This booking cannot be cancelled online now. Your request was not sent.";
    case "PHONE_BLOCKED":
      return "Please contact the hotel to continue.";
    default:
      return "We couldn’t confirm that your request was sent. Check what this page shows now before sending it again.";
  }
}

/** Refusals that leave the form as it is, so the guest can send it again. */
function keptMessage(problem: ApiProblem) {
  switch (problem.code) {
    case "RATE_LIMITED":
      return `Too many requests were sent. Try again in ${waitText((problem.retryAfter ?? 60) * 1000)}.`;
    case "TRY_AGAIN":
      return "The booking is busy. Try again in a moment.";
    default:
      return null;
  }
}

/**
 * Asks the hotel to cancel (API-G2 or the G4 request). Nothing is cancelled
 * here. After an answer, or no answer, the page reads the booking again.
 */
export function CancellationRequestForm({
  access,
  onSettled,
  onRefused,
}: Readonly<{
  access: GuestAccess;
  onSettled: (message: string) => void;
  onRefused: (refusal: AccessRefusal) => void;
}>) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const busy = useRef(false);
  const mounted = useRef(true);
  const reasonInput = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (open) reasonInput.current?.focus();
    else if (wasOpen.current) opener.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(
      () => setWait(0),
      Math.min(wait * 1000, longestTimer),
    );
    return () => clearTimeout(timer);
  }, [wait]);

  function refuseReason(message: string) {
    setReasonError(message);
    reasonInput.current?.focus();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || wait > 0) return;
    const text = reason.trim();
    if (CONTROL.test(text)) return refuseReason(HIDDEN);
    if (text.length > REASON_LIMIT)
      return refuseReason(`Use ${REASON_LIMIT} characters or fewer.`);
    busy.current = true;
    setSending(true);
    setProblem(null);
    setReasonError(null);
    // No abort signal: leaving the page must not make a sent request unknown.
    const result = await requestCancellation(
      access,
      text ? { reason: text } : {},
    );
    busy.current = false;
    if (!mounted.current) return;
    setSending(false);
    if (result.ok) return onSettled("Your request was sent to the hotel.");
    const failure = result.problem;
    if (failure.code !== "PHONE_BLOCKED") {
      const refusal = accessRefusal(failure, access.kind);
      if (refusal) return onRefused(refusal);
    }
    if (failure.code === "VALIDATION")
      return refuseReason(
        failure.fieldErrors?.reason?.join(" ") ?? "Check the reason.",
      );
    const kept = keptMessage(failure);
    if (kept) {
      if (failure.code === "RATE_LIMITED") setWait(failure.retryAfter ?? 60);
      return setProblem(kept);
    }
    onSettled(settledMessage(failure));
  }

  if (!open)
    return (
      <button
        ref={opener}
        type="button"
        className={button("ghost", "justify-self-start max-sm:w-full")}
        onClick={() => setOpen(true)}
      >
        Request cancellation
      </button>
    );

  return (
    <form noValidate onSubmit={submit} className="grid gap-4">
      <p id="cancellation-effect" className="m-0">
        This sends a request to the hotel. Your booking stays confirmed until
        the hotel decides.
      </p>
      {problem && (
        <div role="alert" className={alertBox}>
          <p className="m-0 text-danger">{problem}</p>
        </div>
      )}
      <div className={fieldGroup}>
        <label htmlFor="cancellation-reason" className={fieldLabel}>
          Reason{" "}
          <span className="font-normal text-neutral-600">(optional)</span>
        </label>
        <input
          ref={reasonInput}
          id="cancellation-reason"
          name="reason"
          type="text"
          autoComplete="off"
          maxLength={REASON_LIMIT}
          value={reason}
          readOnly={sending}
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={`cancellation-effect${reasonError ? " cancellation-reason-error" : ""}`}
          className={fieldControl}
          onChange={(event) => {
            setReason(event.currentTarget.value);
            setReasonError(null);
          }}
        />
        {reasonError ? (
          <p id="cancellation-reason-error" className={fieldError}>
            {reasonError}
          </p>
        ) : (
          <p className={fieldHelp}>The hotel reads this with your request.</p>
        )}
      </div>
      <div className="flex flex-wrap gap-3 max-sm:*:w-full">
        <button
          type="submit"
          disabled={sending}
          aria-disabled={wait > 0 ? true : undefined}
          className={button("primary", "aria-disabled:opacity-70")}
        >
          {sending ? "Sending…" : "Send request"}
        </button>
        <button
          type="button"
          disabled={sending}
          className={button("ghost")}
          onClick={() => {
            setProblem(null);
            setReasonError(null);
            setOpen(false);
          }}
        >
          Keep my booking
        </button>
      </div>
    </form>
  );
}
