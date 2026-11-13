import type { BookingProvider } from "@/application/booking/ports";

export class ResolveBooking {
  constructor(private readonly bookingProvider: BookingProvider) {}

  execute() {
    return this.bookingProvider.getLaunchDescriptor();
  }
}
