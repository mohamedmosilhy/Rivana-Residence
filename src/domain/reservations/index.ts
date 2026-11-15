export {
  ReservationStateMachine,
  consumesInventory,
  isTerminalReservation,
  canModifyReservationStay,
  canEditReservationGuest,
  type ReservationState,
  type ReservationAction,
  type TransitionResult,
} from "./state-machine";
export { ReservationReference } from "./reservation-reference";
export {
  validateReservationStructure,
  validateReservationPriceSnapshot,
  validateReservationCreation,
  type ReservationNightSnapshot,
  type ReservationLine,
  type ReservationSnapshot,
  type ReservationRecord,
} from "./reservation";
export { planNightlyRepricing } from "./stay-modification";
