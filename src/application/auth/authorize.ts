import type { StaffPrincipal } from "@/application/auth/ports";
import { failure, success, type Result } from "@/application/shared/result";
import { roleHasCapability, type Capability } from "@/domain/auth/capabilities";

export function authorize(
  staff: StaffPrincipal | null,
  capability: Capability,
): Result<StaffPrincipal> {
  if (!staff) {
    return failure("UNAUTHENTICATED", "Sign in to continue.");
  }
  if (!roleHasCapability(staff.role, capability)) {
    return failure("FORBIDDEN", "Your role does not allow this action.");
  }
  return success(staff);
}
