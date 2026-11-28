import type { Metadata } from "next";
import { connection } from "next/server";

import { BookingSearchFrame } from "@/presentation/features/booking/booking-search-frame";
import { ManageReservation } from "@/presentation/features/booking/manage-reservation";

import { guestPageFacts } from "../guest-pages";

export const metadata: Metadata = {
  title: "Manage your booking",
  robots: { index: false, follow: false },
};

// The server never sees the guest's key: it stays after the `#` of the
// address, and the browser reads the booking itself.
export default async function ManageReservationPage() {
  await connection();
  const { siteName, hotels } = await guestPageFacts();
  return (
    <BookingSearchFrame
      branch={{ name: siteName, hero: null }}
      title="Manage your booking"
    >
      <ManageReservation hotels={hotels} />
    </BookingSearchFrame>
  );
}
