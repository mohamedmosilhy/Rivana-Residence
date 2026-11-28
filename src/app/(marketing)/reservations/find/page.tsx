import type { Metadata } from "next";
import { connection } from "next/server";

import { guestCodeChannels } from "@/composition/verification-channels";
import { VERIFICATION_POLICY } from "@/domain/guests";
import { BookingSearchFrame } from "@/presentation/features/booking/booking-search-frame";
import { MyReservations } from "@/presentation/features/booking/my-reservations";

import { phoneCountries } from "../../phone-countries";
import { guestPageFacts } from "../guest-pages";

export const metadata: Metadata = {
  title: "My reservations",
  robots: { index: false, follow: false },
};

export default async function FindReservationsPage() {
  await connection();
  const [{ siteName, hotels }, channels] = await Promise.all([
    guestPageFacts(),
    guestCodeChannels(),
  ]);
  const { codeLifetimeMs, tokenLifetimeMs } = VERIFICATION_POLICY;
  return (
    <BookingSearchFrame
      branch={{ name: siteName, hero: null }}
      title="My reservations"
    >
      <MyReservations
        channels={channels}
        countries={phoneCountries()}
        hotels={hotels}
        lifetimes={{ codeLifetimeMs, tokenLifetimeMs }}
      />
    </BookingSearchFrame>
  );
}
