// Public surface of the reservations application module (dependency rule D-8).
export type {
  ReservationUnitOfWork,
  ReservationRepository,
  ReservationInsert,
  StoredReservation,
  PhoneBookingRow,
  BookingCrypto,
  StoredReservationLine,
  StoredReservationNight,
  StoredReservationSnapshot,
} from "./ports";
export type { ReservationStorageContext } from "./storage-context";
export {
  CreateWebsiteReservation,
  type CreateWebsiteReservationContext,
  type WebsiteReservationResult,
} from "./create-website-reservation";

export {
  CreateStaffReservation,
  RecordExternalReservation,
  type StaffBookingContext,
  type ExternalReferenceReader,
} from "./create-staff-reservation";
export type {
  StaffReservationInput,
  ExternalReservationInput,
} from "./staff-reservation-input";
export {
  ListReservations,
  GetReservation,
  GetReservationHistory,
  type StaffReservationView,
  type StaffReservationReader,
  type StaffReservationQuery,
  type ReservationListItem,
} from "./staff-reservation-reads";
