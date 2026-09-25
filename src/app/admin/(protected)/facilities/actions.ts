"use server";

import { facilityInputFromForm } from "@/application/content/catalog-forms";
import { facilityCommands } from "@/composition/content";
import type { FormState } from "@/presentation/admin/ui/form-state";

import { catalogActions } from "../catalog-actions";

const facilities = catalogActions(
  facilityCommands,
  "/admin/facilities",
  facilityInputFromForm,
  "facility",
);

export async function createFacilityAction(
  _state: FormState,
  formData: FormData,
) {
  return facilities.create(formData);
}

export async function updateFacilityAction(
  id: string,
  _state: FormState,
  formData: FormData,
) {
  return facilities.update(id, formData);
}

export async function saveFacilityMediaAction(
  id: string,
  _state: FormState,
  formData: FormData,
) {
  return facilities.media(id, formData);
}

export async function publishFacilityAction(id: string) {
  return facilities.transition("publish", id);
}

export async function unpublishFacilityAction(id: string) {
  return facilities.transition("unpublish", id);
}

export async function archiveFacilityAction(id: string) {
  return facilities.transition("archive", id);
}

export async function restoreFacilityAction(id: string) {
  return facilities.transition("restore", id);
}

export async function deleteFacilityAction(id: string) {
  return facilities.delete(id);
}

export async function moveFacilityAction(id: string, offset: -1 | 1) {
  return facilities.move(id, offset);
}
