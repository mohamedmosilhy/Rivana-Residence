import "server-only";

import { getCurrentStaff } from "@/composition/auth";
import { manageVerificationSettings } from "@/composition/verification-channels";

// The admin Guest verification screen (Q-99). Each function resolves the
// signed-in staff member and calls one use case; the use case runs `authorize`.

export async function readVerificationSettings() {
  return manageVerificationSettings().read(await getCurrentStaff());
}

export async function saveVerificationSettings(input: unknown) {
  return manageVerificationSettings().update(await getCurrentStaff(), input);
}
