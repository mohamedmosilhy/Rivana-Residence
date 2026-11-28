import { getBookingSetup } from "@/composition/booking-details";
import { getActiveBranches, getSiteSettings } from "@/composition/public";
import type {
  ChangeOptions,
  GuestHotel,
} from "@/presentation/features/booking/hotel-contacts";

/** What a booking at this branch may be changed to, read fresh. */
async function changeOptions(branchId: string): Promise<ChangeOptions | null> {
  const setup = await getBookingSetup(branchId);
  if (!setup) return null;
  // Plain objects: only these cross to the browser.
  const money = ({ amountMinor }: { amountMinor: number }) => ({
    amountMinor,
    currency: "USD" as const,
  });
  return {
    today: setup.today.value,
    services: setup.services.map(({ kind, unit, price, childPrice }) => ({
      kind,
      unit,
      price: money(price),
      childPrice: childPrice && money(childPrice),
    })),
    maxVehicles: setup.maxVehicles,
  };
}

/**
 * The public facts the guest pages need about every active branch: how to
 * reach it, its stay times, and what it offers now. Nothing here is about a
 * guest.
 */
export async function guestPageFacts() {
  const [settings, branches] = await Promise.all([
    getSiteSettings(),
    getActiveBranches(),
  ]);
  return {
    siteName: settings?.siteName ?? "Rivana Residence",
    hotels: await Promise.all(
      branches.map(async (branch): Promise<GuestHotel> => {
        const change = await changeOptions(branch.id);
        return {
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
          ...(change ? { change } : {}),
        };
      }),
    ),
  };
}
