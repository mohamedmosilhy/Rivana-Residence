import type { BookingProvider } from "@/application/ports/providers";

export class ResolveBooking {
  constructor(private readonly bookingProvider: BookingProvider) {}

  execute() {
    return this.bookingProvider.getLaunchDescriptor();
  }
}
