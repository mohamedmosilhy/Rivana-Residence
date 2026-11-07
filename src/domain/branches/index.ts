// Public surface of the branches domain module (dependency rule D-8).
export {
  BRANCH_STATUSES,
  ONLINE_BOOKING_NOT_READY_MESSAGE,
  RESERVED_BRANCH_SLUGS,
  branchCreateSchema,
  branchCrossFieldIssues,
  branchSchema,
  branchSlugSchema,
  branchUpdateSchema,
  isReservedBranchSlug,
  parseBranchUpdate,
  type BranchAttributes,
  type BranchCreateAttributes,
  type BranchCreateInput,
  type BranchInput,
  type BranchStatus,
  type BranchUpdateAttributes,
} from "./branch";
export {
  DEFAULT_BRANCH_DEACTIVATION_MESSAGE,
  DEFAULT_BRANCH_ID,
  DEFAULT_BRANCH_SLUG,
} from "./default-branch";
export { switchTarget, type SwitchTargetBranch } from "./switch-target";
