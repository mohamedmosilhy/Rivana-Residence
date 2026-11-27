import type { Metadata } from "next";
import { BookingSearchFrame } from "@/presentation/features/booking/booking-search-frame";
import { BookingConfirmation } from "@/presentation/features/booking/booking-confirmation";
import { requireBranch, type BranchParams } from "../../../site-content";

export const metadata: Metadata = {
  title: "Your reservation",
  robots: { index: false, follow: false },
};

export default async function ConfirmedPage({ params }: BranchParams) {
  const branch = await requireBranch(params);
  return (
    <BookingSearchFrame branch={branch} title="Your reservation">
      <BookingConfirmation
        key={branch.slug}
        contact={{
          slug: branch.slug,
          phone: branch.phone,
          email: branch.email,
        }}
      />
      <noscript>
        Enable JavaScript to check this booking, or open your booking message.
      </noscript>
    </BookingSearchFrame>
  );
}
