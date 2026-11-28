"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  bookingHeading,
  bookingPanel,
  button,
} from "@/presentation/site/classes";
import { Icon } from "@/presentation/site/icons";

import {
  forgetManageToken,
  keepManageToken,
  readManageToken,
  takeManageLink,
} from "./guest-access-store";
import { HotelContacts, type GuestHotel } from "./hotel-contacts";
import { ReservationView } from "./reservation-view";

type Link_ =
  | Readonly<{ status: "opening" | "unusable" }>
  | Readonly<{ status: "open"; token: string }>;

/** The booking behind the private link, `/reservations/manage#t=…`. */
export function ManageReservation({
  hotels,
}: Readonly<{ hotels: readonly GuestHotel[] }>) {
  const [link, setLink] = useState<Link_>({ status: "opening" });
  const unusable = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    function open(token: string | null) {
      setLink(token ? { status: "open", token } : { status: "unusable" });
    }
    function follow() {
      const found = takeManageLink();
      // A broken link never falls back to a booking opened earlier.
      if (found.kind === "invalid") forgetManageToken();
      if (found.kind === "token") keepManageToken(found.token);
      if (found.kind !== "none")
        open(found.kind === "token" ? found.token : null);
      return found.kind;
    }
    // Deferred, so the router has taken over the history methods first.
    const start = setTimeout(() => {
      if (follow() === "none") open(readManageToken());
    }, 0);
    // Another link pasted into the same tab changes only the fragment.
    const changed = () => void follow();
    window.addEventListener("hashchange", changed);
    return () => {
      clearTimeout(start);
      window.removeEventListener("hashchange", changed);
    };
  }, []);

  useEffect(() => {
    if (link.status === "unusable") unusable.current?.focus();
  }, [link.status]);

  if (link.status === "open")
    return (
      <ReservationView
        key={link.token}
        access={{ kind: "MANAGE_LINK", token: link.token }}
        hotels={hotels}
        onRefused={() => {
          forgetManageToken();
          setLink({ status: "unusable" });
        }}
      />
    );

  return (
    <section
      className={`${bookingPanel} mx-auto grid w-full max-w-3xl min-w-0 content-start gap-5`}
    >
      {link.status === "opening" ? (
        <>
          {/* Words that stay true if no script ever runs. */}
          <h2 className={bookingHeading}>Your booking</h2>
          <noscript>
            <p>Enable JavaScript to open your booking, or contact the hotel.</p>
            <HotelContacts hotels={hotels} />
          </noscript>
        </>
      ) : (
        <>
          <h2 ref={unusable} tabIndex={-1} className={bookingHeading}>
            Open your booking link
          </h2>
          <p className="m-0">
            This page needs a working private link from your booking message.
            The link may be old or incomplete.
          </p>
          <Link
            href={"/reservations/find" as Route}
            prefetch={false}
            className={button("primary", "justify-self-start max-sm:w-full")}
          >
            Find it in My reservations <Icon name="arrow" />
          </Link>
          <HotelContacts hotels={hotels} />
        </>
      )}
    </section>
  );
}
