"use server";

import { formDataValues } from "@/application/content/form-values";
import { getCurrentStaff } from "@/composition/auth";
import { pageCommands } from "@/composition/content";
import type { PageKey } from "@/domain/content/page-sections";
import type { FormState } from "@/presentation/admin/ui/form-state";

import { actionResult, typedValues } from "../action-results";

// The branch slug is bound by the editor; the use case re-resolves it.
const editPath = (branch: string, key: PageKey) =>
  `/admin/pages/${key.toLowerCase()}?branch=${encodeURIComponent(branch)}`;

export async function saveSectionAction(
  branch: string,
  key: PageKey,
  sectionId: string,
  _state: FormState,
  formData: FormData,
) {
  const result = await pageCommands().saveSection(
    await getCurrentStaff(),
    branch,
    key,
    sectionId,
    formDataValues(formData),
  );
  return actionResult(result, editPath(branch, key), "Section saved.");
}

export async function saveSectionMediaAction(
  branch: string,
  key: PageKey,
  sectionId: string,
  _state: FormState,
  formData: FormData,
) {
  const result = await pageCommands().saveSectionMedia(
    await getCurrentStaff(),
    branch,
    key,
    sectionId,
    formDataValues(formData),
  );
  return actionResult(result, editPath(branch, key), "Section images saved.");
}

export async function savePageDetailsAction(
  branch: string,
  key: PageKey,
  _state: FormState,
  formData: FormData,
) {
  const result = await pageCommands().updateDetails(
    await getCurrentStaff(),
    branch,
    key,
    formDataValues(formData),
  );
  return actionResult(
    result,
    editPath(branch, key),
    "Search details saved.",
    typedValues(formData),
  );
}

export async function moveSectionAction(
  branch: string,
  key: PageKey,
  sectionId: string,
  offset: -1 | 1,
) {
  const result = await pageCommands().moveSection(
    await getCurrentStaff(),
    branch,
    key,
    sectionId,
    offset,
  );
  return actionResult(
    result,
    editPath(branch, key),
    offset < 0 ? "Section moved up." : "Section moved down.",
  );
}

export async function publishPageAction(branch: string, key: PageKey) {
  const result = await pageCommands().publish(
    await getCurrentStaff(),
    branch,
    key,
  );
  return actionResult(
    result,
    editPath(branch, key),
    "Published. The page is live.",
  );
}

export async function unpublishPageAction(branch: string, key: PageKey) {
  const result = await pageCommands().unpublish(
    await getCurrentStaff(),
    branch,
    key,
  );
  return actionResult(
    result,
    editPath(branch, key),
    "Unpublished. The page is no longer public.",
  );
}
