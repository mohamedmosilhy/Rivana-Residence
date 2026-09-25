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

export interface MediaStorage {
  writePending(input: {
    key: string;
    bytes: Uint8Array;
    contentType: string;
  }): Promise<void>;
  finalize(key: string): Promise<void>;
  delete(key: string): Promise<void>;
  open(key: string): Promise<ReadableStream<Uint8Array>>;
  publicUrl(key: string): string;
}

export interface ContactDelivery {
  deliver(input: {
    enquiryId: string;
    replyTo: string;
    subject: string;
    text: string;
  }): Promise<{ messageId: string }>;
}

export interface CacheInvalidator {
  invalidate(tags: readonly string[]): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}
