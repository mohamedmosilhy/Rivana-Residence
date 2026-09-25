import "server-only";

import type {
  BookingLaunchDescriptor,
  BookingProvider,
} from "@/application/ports/providers";

export class DisabledBookingProvider implements BookingProvider {
  async getLaunchDescriptor(): Promise<BookingLaunchDescriptor> {
    return {
      available: false,
      reason: "NOT_CONFIGURED",
      accessibleMessage:
        "Online booking is not available yet. Please contact Rivana Residence directly.",
    };
  }
}
