export type BookingLaunchDescriptor =
  | Readonly<{
      available: false;
      reason: "NOT_CONFIGURED";
      accessibleMessage: string;
    }>
  | Readonly<{
      available: true;
      mode: "LINK" | "EMBED";
      url: string;
    }>;

export interface BookingProvider {
  getLaunchDescriptor(): Promise<BookingLaunchDescriptor>;
}
