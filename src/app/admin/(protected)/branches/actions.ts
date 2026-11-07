"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { formDataValues } from "@/application/content/form-values";
import { getCurrentStaff } from "@/composition/auth";
import { manageBranches } from "@/composition/content";
import { BRANCH_FORM_FIELDS } from "@/presentation/admin/branches/fields";
import type { FormState } from "@/presentation/admin/ui/form-state";

import { actionResult, typedValues } from "../action-results";

/** Only the form's own fields; the use case validates them. */
function branchValues(formData: FormData, withSlug: boolean) {
  const values = formDataValues(formData);
  const picked: Record<string, unknown> = {};
  for (const field of [...BRANCH_FORM_FIELDS, "heroMediaId"] as const) {
    if (field === "slug" && !withSlug) continue;
    if (typeof values[field] === "string") picked[field] = values[field];
  }
  return picked;
}

export async function createBranchAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await manageBranches().create(
    await getCurrentStaff(),
    branchValues(formData, true),
  );
  if (result.ok) {
    revalidatePath("/admin/branches");
    redirect(`/admin/branches/${result.value.id}?notice=created` as Route);
  }
  return actionResult(result, "/admin/branches/new", "", typedValues(formData));
}

export async function updateBranchAction(
  id: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await manageBranches().update(
    await getCurrentStaff(),
    id,
    branchValues(formData, false),
  );
  return actionResult(
    result,
    `/admin/branches/${id}`,
    "Saved. The branch website shows the new details.",
    typedValues(formData),
  );
}
