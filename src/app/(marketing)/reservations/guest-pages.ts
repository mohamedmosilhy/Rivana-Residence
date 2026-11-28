import { getActiveBranches, getSiteSettings } from "@/composition/public";
import type { GuestHotel } from "@/presentation/features/booking/hotel-contacts";

/**
 * The public facts the guest pages need about every active branch: how to
 * reach it and its stay times. Nothing here is about a guest.
 */
export async function guestPageFacts() {
  const [settings, branches] = await Promise.all([
    getSiteSettings(),
    getActiveBranches(),
  ]);
  return {
    siteName: settings?.siteName ?? "Rivana Residence",
    hotels: branches.map(
      (branch): GuestHotel => ({
        slug: branch.slug,
        name: branch.name,
        phone: branch.phone,
        email: branch.email,
        times: {
          checkInTime: branch.checkInTime,
          checkInUntilTime: branch.checkInUntilTime,
          checkOutTime: branch.checkOutTime,
          checkOutFromTime: branch.checkOutFromTime,
        },
      }),
    ),
  };
}
