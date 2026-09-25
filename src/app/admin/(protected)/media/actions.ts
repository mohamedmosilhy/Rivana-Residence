"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { formDataValues } from "@/application/content/form-values";
import { getCurrentStaff } from "@/composition/auth";
import { mediaLibrary } from "@/composition/media";
import type { FormState } from "@/presentation/admin/ui/form-state";

import { actionResult, typedValues } from "../action-results";

const detailPath = (id: string) => `/admin/media/${id}`;

export async function saveMediaDetailsAction(
  id: string,
  _state: FormState,
  formData: FormData,
) {
  const library = await mediaLibrary();
  const result = await library.updateDetails(
    await getCurrentStaff(),
    id,
    formDataValues(formData),
  );
  return actionResult(
    result,
    detailPath(id),
    "Image details saved.",
    typedValues(formData),
  );
}

export async function setMediaRightsAction(
  id: string,
  status: "CONFIRMED" | "UNCONFIRMED",
) {
  const library = await mediaLibrary();
  const result = await library.setRights(await getCurrentStaff(), id, status);
  return actionResult(
    result,
    detailPath(id),
    status === "CONFIRMED"
      ? "Usage rights confirmed."
      : "Usage rights withdrawn.",
  );
}

export async function replaceMediaAction(
  fromId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const toId = formData.get("toId");
  if (typeof toId !== "string" || !/^[a-z0-9]{1,32}$/.test(toId)) {
    return { status: "error", message: "Upload the new image first." };
  }
  const library = await mediaLibrary();
  const result = await library.replace(await getCurrentStaff(), fromId, toId);
  if (result.ok) {
    revalidatePath("/admin", "layout");
    redirect(`${detailPath(toId)}?notice=replaced` as Route);
  }
  return actionResult(result, detailPath(fromId), "");
}

export async function deleteMediaAction(id: string): Promise<FormState> {
  const library = await mediaLibrary();
  const result = await library.delete(await getCurrentStaff(), id);
  if (result.ok) {
    revalidatePath("/admin/media");
    redirect("/admin/media?notice=deleted");
  }
  return actionResult(result, detailPath(id), "");
}
