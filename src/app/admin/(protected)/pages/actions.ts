"use server";

import { formDataValues } from "@/application/content/form-values";
import { getCurrentStaff } from "@/composition/auth";
import { pageCommands } from "@/composition/content";
import type { PageKey } from "@/domain/content/page-sections";
import type { FormState } from "@/presentation/admin/ui/form-state";

import { actionResult, typedValues } from "../action-results";

const editPath = (key: PageKey) => `/admin/pages/${key.toLowerCase()}`;

export async function saveSectionAction(
  key: PageKey,
  sectionId: string,
  _state: FormState,
  formData: FormData,
) {
  const result = await pageCommands().saveSection(
    await getCurrentStaff(),
    key,
    sectionId,
    formDataValues(formData),
  );
  return actionResult(result, editPath(key), "Section saved.");
}

export async function savePageDetailsAction(
  key: PageKey,
  _state: FormState,
  formData: FormData,
) {
  const result = await pageCommands().updateDetails(
    await getCurrentStaff(),
    key,
    formDataValues(formData),
  );
  return actionResult(
    result,
    editPath(key),
    "Search details saved.",
    typedValues(formData),
  );
}

export async function moveSectionAction(
  key: PageKey,
  sectionId: string,
  offset: -1 | 1,
) {
  const result = await pageCommands().moveSection(
    await getCurrentStaff(),
    key,
    sectionId,
    offset,
  );
  return actionResult(
    result,
    editPath(key),
    offset < 0 ? "Section moved up." : "Section moved down.",
  );
}

export async function publishPageAction(key: PageKey) {
  const result = await pageCommands().publish(await getCurrentStaff(), key);
  return actionResult(result, editPath(key), "Published. The page is live.");
}

export async function unpublishPageAction(key: PageKey) {
  const result = await pageCommands().unpublish(await getCurrentStaff(), key);
  return actionResult(
    result,
    editPath(key),
    "Unpublished. The page is no longer public.",
  );
}
