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
export {
  CancellationDeadline,
  type DeadlineBranch,
} from "./cancellation-deadline";
export {
  REQUEST_REASON_MAX,
  canTransitionCancellationRequest,
  isActiveRequest,
  canRequestCancellation,
  canGuestChange,
  decideChangeApplication,
  planApproval,
  parseRejectionReason,
  closedReasonForStaffAction,
  ACTIVE_CANCELLATION_REQUEST_STATUSES,
  type ApprovalPlan,
  type ChangeApplication,
  type GuestRequestDecision,
  type GuestRequestRefusal,
  type StaffTerminalAction,
} from "./cancellation-request";
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
export {
  planReservationChange,
  summarizeReservation,
  type ChangeSummary,
  type CurrentChangeLine,
  type PlannedChangeLine,
  type RequestedChangeLine,
  type ReservationChangePlan,
} from "./reservation-change-plan";
