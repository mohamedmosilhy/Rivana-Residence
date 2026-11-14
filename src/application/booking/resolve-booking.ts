import type { BookingProvider } from "./ports";

export class ResolveBooking {
  constructor(private readonly bookingProvider: BookingProvider) {}

  execute() {
    return this.bookingProvider.getLaunchDescriptor();
  }
}
