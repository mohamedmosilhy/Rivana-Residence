"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { formDataValues } from "@/application/content/form-values";
import {
  replaceSocialLinks,
  updateSiteImages,
  updateSiteSettings,
} from "@/composition/admin";
import { SITE_SETTINGS_FIELDS } from "@/presentation/admin/settings/fields";
import { errorState, type FormState } from "@/presentation/admin/ui/form-state";

const MAX_LINKS_PAYLOAD = 32_000;

export async function saveSiteSettingsAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = Object.fromEntries(
    SITE_SETTINGS_FIELDS.map((name) => [name, formData.get(name)]),
  );
  const result = await updateSiteSettings(
    values,
    formData.get("expectedUpdatedAt"),
  );
  if (!result.ok) {
    if (result.error.code === "UNAUTHENTICATED") {
      redirect("/admin/login?returnTo=%2Fadmin%2Fsettings");
    }
    const typed = Object.fromEntries(
      SITE_SETTINGS_FIELDS.map((name) => {
        const value = formData.get(name);
        return [name, typeof value === "string" ? value : ""];
      }),
    );
    return errorState(result.error, typed);
  }

  revalidatePath("/admin/settings");
  return { status: "success", message: "Site details saved." };
}

function parseLinks(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || value.length > MAX_LINKS_PAYLOAD) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function saveSocialLinksAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await replaceSocialLinks(
    parseLinks(formData.get("links")),
    formData.get("expectedUpdatedAt"),
  );
  if (!result.ok) {
    if (result.error.code === "UNAUTHENTICATED") {
      redirect("/admin/login?returnTo=%2Fadmin%2Fsettings");
    }
    return errorState(result.error);
  }

  revalidatePath("/admin/settings");
  return { status: "success", message: "Social links saved." };
}

export async function saveSiteImagesAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await updateSiteImages(formDataValues(formData));
  if (!result.ok) {
    if (result.error.code === "UNAUTHENTICATED") {
      redirect("/admin/login?returnTo=%2Fadmin%2Fsettings");
    }
    return errorState(result.error);
  }
  revalidatePath("/admin/settings");
  return { status: "success", message: "Brand images saved." };
}
