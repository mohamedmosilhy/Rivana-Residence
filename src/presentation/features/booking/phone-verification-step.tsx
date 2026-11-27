"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import type { ApiProblem } from "@/presentation/api-client/result";
import {
  confirmVerification,
  requestVerification,
} from "@/presentation/api-client/verification";
import {
  alertBox,
  bookingHeading,
  button,
  choiceCard,
  choiceInput,
  eyebrowFlush,
  fieldControl,
  fieldError,
  fieldGroup,
  fieldHelp,
  fieldLabel,
  link,
} from "@/presentation/site/classes";

import { HotelContact, type HotelContactDetails } from "./hotel-contact";
import {
  channelName,
  checkProblemMessage,
  codeDeadlines,
  sendProblemMessage,
  waitText,
  type Verification,
  type VerificationChannel,
  type VerificationLifetimes,
} from "./verification-state";

type View = "send" | "code" | "verified";
const NOT_CONFIGURED = ["WHATSAPP_NOT_CONFIGURED", "EMAIL_NOT_CONFIGURED"];
const CHANNELS: readonly VerificationChannel[] = ["WHATSAPP", "EMAIL"];

/** The device clock, read in event handlers only (render uses `useNow`). */
const deviceTime = () => Date.now();

/** Ticks once a second so waits and expiry follow the clock. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return [now, () => setNow(Date.now())] as const;
}

/**
 * Step 2: prove the phone by WhatsApp (API-P9, P10), or the email where an
 * online payment is possible (Q-100). The journey holds the result.
 */
export function PhoneVerificationStep({
  phone,
  email,
  channels,
  lifetimes,
  value,
  contact,
  onChange,
  onBlocked,
  onInvalidContact,
  onEdit,
  children,
}: Readonly<{
  /** E.164. */
  phone: string;
  email: string;
  /** The channels this booking can use now. At least one is true. */
  channels: Readonly<{ whatsapp: boolean; email: boolean }>;
  lifetimes: VerificationLifetimes;
  value: Verification;
  contact: HotelContactDetails;
  onChange: (value: Verification) => void;
  onBlocked: () => void;
  /** The server refused the phone or email itself. */
  onInvalidContact: (errors: { phone?: string; email?: string }) => void;
  onEdit: () => void;
  /** What follows a successful verification. */
  children?: ReactNode;
}>) {
  const offered = CHANNELS.filter((channel) =>
    channel === "WHATSAPP" ? channels.whatsapp : channels.email,
  );
  const [chosen, setChosen] = useState<VerificationChannel>(
    value.sent?.channel ?? offered[0] ?? "WHATSAPP",
  );
  const [unconfigured, setUnconfigured] = useState<VerificationChannel[]>([]);
  const [pending, setPending] = useState<"send" | "check" | null>(null);
  const [problem, setProblem] = useState<{
    message: string;
    /** The channel that failed, so another can be offered. */
    channel?: VerificationChannel;
    /** The typed code itself is wrong. */
    wrongCode?: boolean;
  } | null>(null);
  /** When a rate limited send may be tried again, by the channel refused. */
  const [waitUntil, setWaitUntil] = useState<
    Partial<Record<VerificationChannel, number>>
  >({});
  const [checkWaitUntil, setCheckWaitUntil] = useState(0);
  const [code, setCode] = useState("");
  const [now, refreshNow] = useNow();
  const busy = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const verifiedHeading = useRef<HTMLHeadingElement>(null);

  const { sent, verified } = value;
  const view: View =
    verified && now < verified.expiresAtMs
      ? "verified"
      : sent && now < sent.expiresAtMs
        ? "code"
        : "send";
  const expired =
    view === "send" &&
    (verified
      ? "Your verification expired. Verify again."
      : sent
        ? "Your code expired. Send a new code."
        : null);
  const usable = offered.filter((channel) => !unconfigured.includes(channel));
  const channel = usable.includes(chosen) ? chosen : usable[0];
  const sentAt = sent?.verificationId;

  // Move focus with the view, and to a new code's input.
  useEffect(() => {
    if (view === "verified") verifiedHeading.current?.focus();
    else if (view === "code") codeInput.current?.focus();
    else heading.current?.focus();
  }, [view, sentAt]);

  async function send(by: VerificationChannel) {
    if (busy.current) return;
    busy.current = true;
    setPending("send");
    setProblem(null);
    setChosen(by);
    const address = email.toLowerCase();
    const askedAt = deviceTime();
    const result = await requestVerification({
      phone,
      purpose: "BOOKING",
      channel: by,
      ...(by === "EMAIL" ? { email: address } : {}),
    });
    busy.current = false;
    setPending(null);
    refreshNow();
    if (result.ok) {
      setCode("");
      setWaitUntil({});
      setCheckWaitUntil(0);
      onChange({
        verified: null,
        sent: {
          channel: by,
          phone,
          email: by === "EMAIL" ? address : null,
          verificationId: result.data.verificationId,
          ...codeDeadlines(result.data, lifetimes, askedAt),
        },
      });
      return;
    }
    refused(result.problem, by);
  }

  function refused(failure: ApiProblem, by: VerificationChannel) {
    if (failure.code === "PHONE_BLOCKED") return onBlocked();
    const { phone: phoneErrors, email: emailErrors } =
      failure.fieldErrors ?? {};
    if (phoneErrors || emailErrors)
      return onInvalidContact({
        ...(phoneErrors ? { phone: phoneErrors.join(" ") } : {}),
        ...(emailErrors ? { email: emailErrors.join(" ") } : {}),
      });
    if (failure.code === "RATE_LIMITED") {
      const until = deviceTime() + (failure.retryAfter ?? 60) * 1000;
      setWaitUntil((current) => ({ ...current, [by]: until }));
    }
    if (NOT_CONFIGURED.includes(failure.code))
      setUnconfigured((current) => [...current, by]);
    setProblem({ message: sendProblemMessage(failure, by), channel: by });
  }

  async function check(event: FormEvent) {
    event.preventDefault();
    if (busy.current || !sent || checkWaitUntil > deviceTime()) return;
    if (code.length !== 6) {
      setProblem({ message: "Enter the 6 digit code.", wrongCode: true });
      codeInput.current?.focus();
      return;
    }
    busy.current = true;
    setPending("check");
    setProblem(null);
    const askedAt = deviceTime();
    const result = await confirmVerification(sent.verificationId, { code });
    busy.current = false;
    setPending(null);
    refreshNow();
    if (result.ok) {
      const { channel: by, phone: number, email: address } = sent;
      onChange({
        sent: null,
        verified: {
          channel: by,
          phone: number,
          email: address,
          token: result.data.token,
          // This device's clock, from before the server issued the token, so
          // the page never trusts it for longer than the server does.
          expiresAtMs: askedAt + lifetimes.tokenLifetimeMs,
        },
      });
      return;
    }
    const failure = result.problem;
    if (failure.code === "PHONE_BLOCKED") return onBlocked();
    const attemptsLeft = failure.context?.attemptsLeft;
    if (
      failure.code === "VERIFICATION_EXPIRED" ||
      (failure.code === "VERIFICATION_CODE_INVALID" && attemptsLeft === 0)
    ) {
      onChange({ sent: null, verified: null });
      setProblem({
        message:
          failure.code === "VERIFICATION_EXPIRED"
            ? "That code can no longer be used. Send a new code."
            : "That code is not correct and no attempts are left. Send a new code.",
      });
      return;
    }
    if (failure.code === "RATE_LIMITED")
      setCheckWaitUntil(deviceTime() + (failure.retryAfter ?? 60) * 1000);
    setProblem({
      wrongCode:
        failure.code === "VERIFICATION_CODE_INVALID" ||
        failure.code === "VALIDATION",
      message:
        failure.code === "VERIFICATION_CODE_INVALID"
          ? typeof attemptsLeft === "number"
            ? `That code is not correct. ${attemptsLeft} ${attemptsLeft === 1 ? "attempt" : "attempts"} left.`
            : "That code is not correct."
          : checkProblemMessage(failure),
    });
    codeInput.current?.focus();
  }

  const destination = (by: VerificationChannel) =>
    by === "WHATSAPP" ? phone : email;
  // Every channel counts against the phone, so a WhatsApp wait holds for both.
  // An email wait may be the address's own limit, so it holds for email only.
  const waitFor = (by: VerificationChannel | undefined) =>
    by
      ? Math.max(
          waitUntil.WHATSAPP ?? 0,
          waitUntil[by] ?? 0,
          sent && (sent.channel === "WHATSAPP" || sent.channel === by)
            ? sent.resendAtMs
            : 0,
        ) - now
      : 0;
  const sendWait = waitFor(channel);
  const resendWait = waitFor(sent?.channel);
  const checkWait = checkWaitUntil - now;
  const other = usable.find(
    (candidate) => candidate !== (sent?.channel ?? problem?.channel),
  );
  // A code that timed out outranks an earlier remark about checking it.
  const alert =
    problem && (problem.channel || !expired) ? problem.message : expired;
  const emailNote =
    "With a code by email you pay online, and the hotel confirms your phone number when you arrive.";
  const edit = (
    <button
      type="button"
      className={`${link} justify-self-start`}
      disabled={pending !== null}
      onClick={onEdit}
    >
      Edit your details
    </button>
  );

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <p className={eyebrowFlush}>Step 2 of 5</p>
        <h2 ref={heading} tabIndex={-1} className={bookingHeading}>
          Verify your contact
        </h2>
      </div>

      {alert && (
        <div id="verification-alert" role="alert" className={alertBox}>
          <p className="m-0 text-danger">{alert}</p>
          {/* A code that could not be sent: the hotel is the other way in. */}
          {problem?.channel && channel !== undefined && (
            <HotelContact contact={contact} />
          )}
        </div>
      )}

      {view === "verified" && verified && (
        <div className="grid gap-4">
          <div className="grid gap-2 border-l-2 border-success bg-canvas px-4 py-3">
            <h3
              ref={verifiedHeading}
              tabIndex={-1}
              className="m-0 text-body-lg font-medium text-success"
            >
              {verified.channel === "EMAIL"
                ? "Email verified"
                : "Phone verified"}
            </h3>
            <p className="m-0 text-small wrap-anywhere">
              {verified.channel === "EMAIL" ? verified.email : verified.phone}
            </p>
            {verified.channel === "EMAIL" && (
              <p className="m-0 text-small">
                You will pay online for this booking. The hotel will confirm
                your phone number when you arrive.
              </p>
            )}
          </div>
          {children}
          {edit}
        </div>
      )}

      {view === "code" && sent && (
        <form noValidate onSubmit={check} className="grid gap-4">
          <p role="status" className="m-0 wrap-anywhere">
            We sent a 6 digit code by {channelName[sent.channel]} to{" "}
            {destination(sent.channel)}. It expires{" "}
            {lifetimes.codeLifetimeMs / 60_000} minutes after it was sent.
          </p>
          <div className={fieldGroup}>
            <label htmlFor="verification-code" className={fieldLabel}>
              Verification code
            </label>
            <input
              ref={codeInput}
              id="verification-code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              readOnly={pending === "check"}
              aria-invalid={problem?.wrongCode ? true : undefined}
              aria-describedby={
                problem?.wrongCode ? "verification-alert" : undefined
              }
              className={`${fieldControl} max-w-56 tracking-[0.3em] tabular-nums`}
              onChange={(event) =>
                setCode(
                  event.currentTarget.value.replace(/\D/g, "").slice(0, 6),
                )
              }
            />
          </div>
          <button
            type="submit"
            disabled={pending !== null}
            aria-disabled={checkWait > 0 ? true : undefined}
            aria-describedby={checkWait > 0 ? "check-wait" : undefined}
            className={button(
              "primary",
              "justify-self-start aria-disabled:opacity-70 max-sm:w-full",
            )}
          >
            {pending === "check" ? "Checking…" : "Verify code"}
          </button>
          {checkWait > 0 && (
            <p id="check-wait" className={fieldError}>
              You can try a code again in {waitText(checkWait)}.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-7">
            <button
              type="button"
              className={`${link} aria-disabled:opacity-70`}
              disabled={pending !== null}
              aria-disabled={resendWait > 0 ? true : undefined}
              aria-describedby={resendWait > 0 ? "resend-wait" : undefined}
              onClick={() => {
                if (resendWait <= 0) void send(sent.channel);
              }}
            >
              {pending === "send" ? "Sending…" : "Send again"}
            </button>
            {other && (
              <button
                type="button"
                className={`${link} aria-disabled:opacity-70`}
                disabled={pending !== null}
                aria-disabled={waitFor(other) > 0 ? true : undefined}
                aria-describedby={
                  waitFor(other) > 0 && resendWait > 0
                    ? "resend-wait"
                    : undefined
                }
                onClick={() => {
                  if (waitFor(other) <= 0) void send(other);
                }}
              >
                Send by {channelName[other]} instead
              </button>
            )}
          </div>
          {resendWait > 0 && (
            <p id="resend-wait" className={fieldHelp}>
              You can send another code in {waitText(resendWait)}.
            </p>
          )}
          {other === "EMAIL" && <p className={fieldHelp}>{emailNote}</p>}
          {edit}
        </form>
      )}

      {view === "send" && (
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (channel && sendWait <= 0) void send(channel);
          }}
        >
          {channel === undefined ? (
            <>
              <p className="m-0">
                A code cannot be sent right now. Contact the hotel to book.
              </p>
              <HotelContact contact={contact} />
            </>
          ) : (
            <>
              {usable.length > 1 ? (
                <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
                  <legend className={`${fieldLabel} mb-2 p-0`}>
                    How should we send your code?
                  </legend>
                  {usable.map((option) => (
                    <label key={option} className={choiceCard}>
                      <input
                        type="radio"
                        name="channel"
                        value={option}
                        checked={channel === option}
                        disabled={pending !== null}
                        className={choiceInput}
                        onChange={() => setChosen(option)}
                      />
                      <span className="min-w-0 wrap-anywhere">
                        {option === "WHATSAPP" ? "WhatsApp" : "Email"} to{" "}
                        {destination(option)}
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : (
                <p className="m-0 wrap-anywhere">
                  We will send a 6 digit code by {channelName[channel]} to{" "}
                  {destination(channel)}.
                </p>
              )}
              {channel === "EMAIL" && <p className={fieldHelp}>{emailNote}</p>}
              <button
                type="submit"
                disabled={pending !== null}
                aria-disabled={sendWait > 0 ? true : undefined}
                aria-describedby={sendWait > 0 ? "send-wait" : undefined}
                className={button(
                  "primary",
                  "justify-self-start aria-disabled:opacity-70 max-sm:w-full",
                )}
              >
                {pending === "send" ? "Sending…" : "Send code"}
              </button>
              {sendWait > 0 && (
                <p id="send-wait" className={fieldError}>
                  You can send another code in {waitText(sendWait)}.
                </p>
              )}
            </>
          )}
          {edit}
        </form>
      )}
    </div>
  );
}
