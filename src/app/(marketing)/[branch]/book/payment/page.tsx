import type { Metadata } from "next";

import { BookingSearchFrame } from "@/presentation/features/booking/booking-search-frame";
import { PaymentReturn } from "@/presentation/features/booking/payment-return";

import { requireBranch, type BranchParams } from "../../../site-content";

export const metadata: Metadata = {
  title: "Payment status",
  robots: { index: false, follow: false },
};

export default async function PaymentPage({ params }: BranchParams) {
  const branch = await requireBranch(params);
  return (
    <BookingSearchFrame branch={branch} title="Payment status">
      <PaymentReturn
        key={branch.slug}
        contact={{
          slug: branch.slug,
          phone: branch.phone,
          email: branch.email,
        }}
        times={{
          checkInTime: branch.checkInTime,
          checkInUntilTime: branch.checkInUntilTime,
          checkOutTime: branch.checkOutTime,
          checkOutFromTime: branch.checkOutFromTime,
        }}
      />
    </BookingSearchFrame>
  );
}
