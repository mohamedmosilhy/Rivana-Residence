import type { Route } from "next";
import Link from "next/link";

import { link } from "@/presentation/site/classes";

/** The way back to a booking for a guest without its private link. */
export function MyReservationsLink() {
  return (
    <Link
      href={"/reservations/find" as Route}
      prefetch={false}
      className={`${link} justify-self-start`}
    >
      My reservations
    </Link>
  );
}
