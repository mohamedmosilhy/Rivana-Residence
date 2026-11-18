import type { WhatsAppVariableKey } from "./whatsapp-template";

/**
 * Obviously fake values for the Admin's test message (API-A8). They fill any
 * template, so a test proves the name, language, and variable count match
 * what Meta approved without touching a real reservation.
 */
export const WHATSAPP_SAMPLE_VARIABLES: Readonly<
  Record<WhatsAppVariableKey, string>
> = {
  guestFirstName: "Test",
  reference: "TEST-0000",
  branchName: "Rivana Residence",
  checkIn: "2030-01-01",
  checkOut: "2030-01-03",
  total: "USD 0.00",
  manageLink: "https://example.com/test",
  code: "123456",
  holdExpiresAt: "2030-01-01 12:00",
  refundAmount: "USD 0.00",
  reason: "Test message",
  feedbackLink: "https://example.com/test",
};
