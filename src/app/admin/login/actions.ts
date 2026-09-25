"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";

import { safeReturnPath } from "@/application/auth/return-path";
import { signInWithPassword } from "@/composition/auth";
import type { FormState } from "@/presentation/admin/ui/form-state";

export async function signInAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await signInWithPassword(
    formData.get("email"),
    formData.get("password"),
  );
  if (!result.ok) {
    const email = formData.get("email");
    return {
      status: "error",
      message: result.error.message,
      values: { email: typeof email === "string" ? email.slice(0, 320) : "" },
    };
  }
  redirect(safeReturnPath(formData.get("returnTo")) as Route);
}
