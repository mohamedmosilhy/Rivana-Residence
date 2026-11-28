"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { getGuestReservation } from "@/presentation/api-client/guest";
import {
  bookingHeading,
  bookingPanel,
  bookingSubheading,
  button,
} from "@/presentation/site/classes";
import { Icon } from "@/presentation/site/icons";

import { BookingDetails, type BookingDetail } from "./booking-details";
import { readBookingResult } from "./booking-result";
import { HotelContact, type HotelContactDetails } from "./hotel-contact";
import type { StayTimes } from "./stay-dates";

const fastPhaseMs = 20_000;
const checkLimitMs = 120_000;

const messages = {
  opening: {
    title: "Check your booking",
    body: "",
    icon: "clock",
    tone: "border-gold-400 text-plum-700",
  },
  checking: {
    title: "Checking your booking",
    body: "We’re waiting for the payment result. This can take a moment.",
    icon: "clock",
    tone: "border-gold-400 text-plum-700",
  },
  waiting: {
    title: "Still waiting for the payment result",
    body: "You can check again here. If your booking is confirmed, we’ll send you a message with a private link to manage your stay.",
    icon: "clock",
    tone: "border-gold-400 text-plum-700",
  },
  retry: {
    title: "We couldn’t check your booking",
    body: "Please try checking again in a moment.",
    icon: "clock",
    tone: "border-gold-400 text-plum-700",
  },
  missing: {
    title: "Open your booking message",
    body: "If you’ve received a booking message, use its private link to check your stay. You can also contact the hotel for help.",
    icon: "mail",
    tone: "border-gold-400 text-plum-700",
  },
  failed: {
    title: "Payment not completed",
    body: "The rooms or apartments held for this booking have been released. You can search for an available stay again.",
    icon: "close",
    tone: "border-danger/30 text-danger",
  },
  other: {
    title: "Check your current booking status",
    body: "Use the private link in your booking message or contact the hotel for help.",
    icon: "mail",
    tone: "border-gold-400 text-plum-700",
  },
} as const;

type Status = keyof typeof messages;
type Screen =
  | { status: Exclude<Status, "retry"> }
  | { status: "retry"; blocked: boolean }
  | { status: "confirmed"; booking: BookingDetail };

export function PaymentReturn({
  contact,
  times,
}: Readonly<{ contact: HotelContactDetails; times: StayTimes }>) {
  const [screen, setScreen] = useState<Screen>({ status: "opening" });
  const [attempt, setAttempt] = useState(0);
  const panel = useRef<HTMLElement>(null);
  const slug = contact.slug;

  useEffect(() => {
    const controller = new AbortController();
    let started = 0;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let nextCheck: ReturnType<typeof setTimeout> | undefined;
    let retryUnlock: ReturnType<typeof setTimeout> | undefined;
    let sawPending = false;

    function timeIsUp() {
      controller.abort();
      clearTimeout(nextCheck);
      setScreen(
        sawPending
          ? { status: "waiting" }
          : { status: "retry", blocked: false },
      );
    }

    function finish(next: Screen) {
      clearTimeout(deadline);
      setScreen(next);
    }

    function checkFailed(retryAfter: number) {
      const blocked = retryAfter > 0;
      finish({ status: "retry", blocked });
      if (blocked) {
        // Browser timers have a signed 32 bit delay limit.
        const retryAt = Date.now() + retryAfter * 1000;
        function unlockWhenReady() {
          const remaining = retryAt - Date.now();
          if (remaining <= 0) setScreen({ status: "retry", blocked: false });
          else {
            retryUnlock = setTimeout(
              unlockWhenReady,
              Math.min(remaining, 2_147_483_647),
            );
          }
        }
        unlockWhenReady();
      }
    }

    async function check(token: string, reference: string) {
      if (performance.now() - started >= checkLimitMs) {
        timeIsUp();
        return;
      }

      const result = await getGuestReservation(
        { kind: "MANAGE_LINK", token },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (performance.now() - started >= checkLimitMs) {
        timeIsUp();
        return;
      }
      if (!result.ok) {
        if (result.problem.status === 401 || result.problem.status === 404) {
          finish({ status: "missing" });
        } else {
          checkFailed(result.problem.retryAfter ?? 0);
        }
        return;
      }

      const booking = result.data;
      if (
        booking.branch?.slug !== slug ||
        booking.reference !== reference ||
        booking.paymentMethod !== "ONLINE"
      ) {
        finish({ status: "missing" });
        return;
      }

      switch (booking.status) {
        case "CONFIRMED":
          finish({ status: "confirmed", booking });
          return;
        case "PAYMENT_FAILED":
          finish({ status: "failed" });
          return;
        case "AWAITING_PAYMENT": {
          sawPending = true;
          // Keep the cadence anchored to the first check and skip missed slots.
          const elapsed = performance.now() - started;
          const phaseStart = elapsed < fastPhaseMs ? 0 : fastPhaseMs;
          const interval = elapsed < fastPhaseMs ? 2000 : 5000;
          const next =
            phaseStart +
            (Math.floor((elapsed - phaseStart) / interval) + 1) * interval;
          if (next < checkLimitMs)
            nextCheck = setTimeout(
              () => void check(token, reference),
              next - elapsed,
            );
          return;
        }
        default:
          finish({ status: "other" });
      }
    }

    const start = setTimeout(() => {
      const saved = readBookingResult(slug);
      if (saved?.status !== "AWAITING_PAYMENT") {
        setScreen({ status: "missing" });
        return;
      }
      started = performance.now();
      deadline = setTimeout(timeIsUp, checkLimitMs);
      setScreen({ status: "checking" });
      void check(saved.token, saved.reference);
    }, 0);
    return () => {
      controller.abort();
      clearTimeout(start);
      clearTimeout(nextCheck);
      clearTimeout(deadline);
      clearTimeout(retryUnlock);
    };
  }, [slug, attempt]);

  const confirmed = screen.status === "confirmed";
  const message = confirmed ? null : messages[screen.status];
  const retry = screen.status === "waiting" || screen.status === "retry";
  const blocked = screen.status === "retry" && screen.blocked;

  return (
    <div className="mx-auto grid w-full max-w-5xl min-w-0 items-start gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-8">
      <section
        ref={panel}
        tabIndex={-1}
        aria-label="Booking payment result"
        className={`${bookingPanel} grid min-w-0 scroll-mt-[calc(var(--header-height-compact)+1.5rem)] gap-5`}
      >
        <p role="status" className="sr-only">
          {confirmed ? "Booking confirmed." : message?.title}
        </p>
        {confirmed && <BookingDetails booking={screen.booking} times={times} />}
        {message && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <span
                className={`grid size-14 flex-none place-content-center border bg-canvas ${message.tone}`}
              >
                <Icon name={message.icon} className="size-7" />
              </span>
              <h2 className={bookingHeading}>{message.title}</h2>
            </div>
            {message.body && (
              <p className="m-0 max-w-[48ch] text-neutral-600">
                {message.body}
              </p>
            )}
            {screen.status === "opening" && (
              <noscript>
                <p className="m-0 max-w-[48ch] text-neutral-600">
                  Enable JavaScript to check here, or use the private link in
                  your booking message if you received one.
                </p>
              </noscript>
            )}
            {blocked && (
              <p className="m-0 text-small text-neutral-600" role="status">
                The website is busy. You can check again when the button is
                available.
              </p>
            )}
            {retry && (
              <button
                type="button"
                className={button(
                  "primary",
                  "justify-self-start max-sm:w-full",
                )}
                disabled={blocked}
                onClick={() => {
                  panel.current?.focus();
                  setAttempt((n) => n + 1);
                }}
              >
                Check again
              </button>
            )}
            {screen.status === "failed" && (
              <Link
                href={`/${slug}/book` as Route}
                className={button(
                  "primary",
                  "justify-self-start max-sm:w-full",
                )}
              >
                Search again <Icon name="arrow" />
              </Link>
            )}
          </>
        )}
      </section>
      <aside className="grid min-w-0 gap-3 border border-neutral-300 bg-canvas p-[clamp(1.125rem,3vw,2rem)]">
        <h2 className={bookingSubheading}>Need help?</h2>
        {confirmed && (
          <p className="m-0 text-neutral-600">
            Use the private link in your booking message to manage your stay.
          </p>
        )}
        <HotelContact contact={contact} />
      </aside>
    </div>
  );
}
