import type { BranchRepository } from "@/application/branches";
import {
  verificationUsableForBranchNow,
  type VerificationChannelReadiness,
} from "@/application/guests";
import type { ServiceOfferingRepository } from "@/application/services";
import type { Clock } from "@/application/shared/providers";
import { GUEST_CONSENT_VERSIONS } from "@/domain/guests";
import { localDateAt } from "@/domain/shared/zoned-time";

/** The same reasons P7 gives in `BRANCH_NOT_BOOKABLE`. */
export type NotBookableReason =
  | "ONLINE_BOOKING_DISABLED"
  | "CHECK_IN_TIME_MISSING"
  | "VERIFICATION_NOT_CONFIGURED";

/**
 * What the booking pages of one branch may offer now (spec 0007). A fresh
 * read with no writes: P6, P9 and P7 stay the authority on every step.
 */
export class GetBookingSetup {
  constructor(
    private readonly deps: Readonly<{
      branches: Pick<BranchRepository, "findRowById">;
      channels: VerificationChannelReadiness;
      services: Pick<ServiceOfferingRepository, "listByBranch">;
      paymentReady: () => boolean;
      clock: Clock;
    }>,
  ) {}

  /** Everything but the services: all the search page needs. */
  async readiness(branchId: string) {
    const branch = await this.deps.branches.findRowById(branchId);
    if (branch?.status !== "ACTIVE") return null;

    const onlinePaymentPossible =
      branch.onlinePaymentEnabled && this.deps.paymentReady();
    const missing: NotBookableReason | null = !branch.onlineBookingEnabled
      ? "ONLINE_BOOKING_DISABLED"
      : !branch.checkInTime
        ? "CHECK_IN_TIME_MISSING"
        : null;
    // A branch that cannot book offers no channel, so none is read. An email
    // booking is paid online (Q-100), so email needs online payment too.
    const whatsapp =
      missing === null && (await this.deps.channels.isReady("WHATSAPP"));
    const email =
      missing === null &&
      onlinePaymentPossible &&
      (await this.deps.channels.isReady("EMAIL"));
    // P7's rule, over the readiness just read.
    const usable =
      missing === null &&
      (await verificationUsableForBranchNow(
        {
          isReady: async (channel) =>
            channel === "WHATSAPP" ? whatsapp : email,
        },
        onlinePaymentPossible,
      ));
    return {
      ...(usable
        ? { bookable: true as const }
        : {
            bookable: false as const,
            notBookableReason: missing ?? "VERIFICATION_NOT_CONFIGURED",
          }),
      channels: { whatsapp, email },
      onlinePaymentPossible,
      checkInTime: branch.checkInTime,
      checkOutTime: branch.checkOutTime,
      checkInUntilTime: branch.checkInUntilTime,
      checkOutFromTime: branch.checkOutFromTime,
      timeZone: branch.timeZone,
      consentVersions: GUEST_CONSENT_VERSIONS,
      today: localDateAt(this.deps.clock.now(), branch.timeZone),
      phone: branch.phone,
      email: branch.email,
    };
  }

  /** The whole setup the booking steps use. */
  async execute(branchId: string) {
    const readiness = await this.readiness(branchId);
    if (!readiness) return null;
    const offered = (await this.deps.services.listByBranch(branchId)).filter(
      (service) => service.active,
    );
    return {
      ...readiness,
      services: offered.map(({ kind, priceUnit, price, childPrice }) => ({
        kind,
        unit: priceUnit,
        price,
        childPrice,
      })),
      /** Cars a guest may choose for the airport transfer; null without one. */
      maxVehicles:
        offered.find((service) => service.kind === "AIRPORT_TRANSFER")
          ?.maxVehicles ?? null,
    };
  }
}

export type BookingSetup = NonNullable<
  Awaited<ReturnType<GetBookingSetup["execute"]>>
>;
