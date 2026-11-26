// The typed browser client for the public and guest API (M10-T1). Requests are
// typed from `src/contracts`; nothing here adds server code to a bundle.

export { sendAnalyticsEvents, type AnalyticsEvent } from "./analytics-events";
export { analyticsSessionId } from "./analytics-session";
export { searchAvailability } from "./availability";
export {
  applyChange,
  getGuestReservation,
  listGuestReservations,
  previewChange,
  requestCancellation,
  type ChangeSubmitted,
  type GuestAccess,
} from "./guest";
export { requestQuote, type QuoteInput } from "./quotes";
export { REQUEST_TIMEOUT_MS } from "./request";
export {
  createReservation,
  type BookingCreated,
  type BookingInput,
} from "./reservations";
export type {
  ApiFailure,
  ApiProblem,
  ApiProblemCode,
  ApiResult,
  ApiSuccess,
  CallOptions,
} from "./result";
export { confirmVerification, requestVerification } from "./verification";
