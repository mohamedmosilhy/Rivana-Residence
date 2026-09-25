"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { formDataValues } from "@/application/content/form-values";
import { promotionInputFromForm } from "@/application/promotions/promotion-admin";
import { getCurrentStaff } from "@/composition/auth";
import { promotionAdmin, propertyTimeZone } from "@/composition/content";
import type { FormState } from "@/presentation/admin/ui/form-state";

import { actionResult, typedValues } from "../action-results";

const LIST = "/admin/promotions";
const editPath = (id: string) => `${LIST}/${id}`;

async function input(formData: FormData) {
  return promotionInputFromForm(
    formDataValues(formData),
    await propertyTimeZone(),
  );
}

export async function createPromotionAction(
  _state: FormState,
  formData: FormData,
) {
  const parsed = await input(formData);
  const result = parsed.ok
    ? await promotionAdmin().create(await getCurrentStaff(), parsed.value)
    : parsed;
  if (result.ok) {
    revalidatePath(LIST);
    redirect(`${editPath(result.value.id)}?notice=created` as Route);
  }
  return actionResult(result, `${LIST}/new`, "", typedValues(formData));
}

export async function updatePromotionAction(
  id: string,
  _state: FormState,
  formData: FormData,
) {
  const parsed = await input(formData);
  const result = parsed.ok
    ? await promotionAdmin().update(await getCurrentStaff(), id, parsed.value)
    : parsed;
  return actionResult(result, editPath(id), "Saved.", typedValues(formData));
}

const messages = {
  publish: "Published.",
  unpublish: "Unpublished. The promotion is back to draft.",
  archive: "Archived. The promotion no longer shows.",
  restore: "Restored as a draft.",
} as const;

async function transition(operation: keyof typeof messages, id: string) {
  const result = await promotionAdmin()[operation](await getCurrentStaff(), id);
  if (result.ok) revalidatePath(LIST);
  return actionResult(result, editPath(id), messages[operation]);
}

export async function publishPromotionAction(id: string) {
  return transition("publish", id);
}

export async function unpublishPromotionAction(id: string) {
  return transition("unpublish", id);
}

export async function archivePromotionAction(id: string) {
  return transition("archive", id);
}

export async function restorePromotionAction(id: string) {
  return transition("restore", id);
}

export async function deletePromotionAction(id: string) {
  const result = await promotionAdmin().delete(await getCurrentStaff(), id);
  if (result.ok) {
    revalidatePath(LIST);
    redirect(`${LIST}?notice=deleted`);
  }
  return actionResult(result, editPath(id), "");
}
