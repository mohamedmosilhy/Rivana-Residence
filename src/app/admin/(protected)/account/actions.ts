"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { changeOwnPassword, revokeOwnOtherSessions } from "@/composition/auth";
import type { FormState } from "@/presentation/admin/auth/form-state";

const passwordInput = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(1).max(256),
});

export async function changePasswordAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = passwordInput.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Enter your current and new password." };
  }

  const result = await changeOwnPassword(
    parsed.data.currentPassword,
    parsed.data.newPassword,
  );
  if (!result.ok) {
    if (result.error.code === "UNAUTHENTICATED") redirect("/admin/login");
    return {
      status: "error",
      message: result.error.message,
      ...(result.error.fieldErrors
        ? { fieldErrors: result.error.fieldErrors }
        : {}),
    };
  }

  revalidatePath("/admin/account");
  return {
    status: "success",
    message: "Password changed. Your other sessions were signed out.",
  };
}

export async function revokeOtherSessionsAction() {
  const result = await revokeOwnOtherSessions();
  if (!result.ok) redirect("/admin/login");
  revalidatePath("/admin/account");
}
