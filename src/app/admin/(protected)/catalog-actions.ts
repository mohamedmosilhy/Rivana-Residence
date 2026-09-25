import "server-only";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { CatalogCommands } from "@/application/content/catalog-commands";
import { mediaAssignmentsFromForm } from "@/application/content/catalog-forms";
import { formDataValues } from "@/application/content/form-values";
import type { FormValues } from "@/application/content/form-values";
import { getCurrentStaff } from "@/composition/auth";
import type { PublicationStatus } from "@/domain/shared/types";
import type { FormState } from "@/presentation/admin/ui/form-state";

import { actionResult, typedValues } from "./action-results";

type CatalogRecord = Readonly<{
  id: string;
  slug: string;
  status: PublicationStatus;
}>;

// Shared Server Action bodies for rooms and facilities. Each route's
// actions.ts exposes thin "use server" wrappers around these.
export function catalogActions<Dto extends CatalogRecord, Input>(
  commands: () => CatalogCommands<Dto, Input>,
  basePath: "/admin/rooms" | "/admin/facilities",
  toInput: (values: FormValues) => Input,
  noun: string,
) {
  const editPath = (id: string) => `${basePath}/${id}`;

  return {
    async create(formData: FormData): Promise<FormState> {
      const result = await commands().create(
        await getCurrentStaff(),
        toInput(formDataValues(formData)),
      );
      if (result.ok) {
        revalidatePath(basePath);
        redirect(`${editPath(result.value.id)}?notice=created` as Route);
      }
      return actionResult(result, `${basePath}/new`, "", typedValues(formData));
    },

    async update(id: string, formData: FormData): Promise<FormState> {
      const result = await commands().update(
        await getCurrentStaff(),
        id,
        toInput(formDataValues(formData)),
      );
      return actionResult(
        result,
        editPath(id),
        `Saved. ${capitalize(noun)} details are up to date.`,
        typedValues(formData),
      );
    },

    async media(id: string, formData: FormData): Promise<FormState> {
      const assignments = mediaAssignmentsFromForm(formDataValues(formData));
      const result = assignments.ok
        ? await commands().replaceMedia(
            await getCurrentStaff(),
            id,
            assignments.value,
          )
        : assignments;
      return actionResult(result, editPath(id), "Images saved.");
    },

    async transition(
      operation: "publish" | "unpublish" | "archive" | "restore",
      id: string,
    ): Promise<FormState> {
      const result = await commands()[operation](await getCurrentStaff(), id);
      const messages = {
        publish: `Published. The ${noun} is live on the website.`,
        unpublish: `Unpublished. The ${noun} is back to draft.`,
        archive: `Archived. The ${noun} is hidden from the website.`,
        restore: `Restored as a draft.`,
      };
      if (result.ok) revalidatePath(basePath);
      return actionResult(result, editPath(id), messages[operation]);
    },

    async delete(id: string): Promise<FormState> {
      const result = await commands().delete(await getCurrentStaff(), id);
      if (result.ok) {
        revalidatePath(basePath);
        redirect(`${basePath}?notice=deleted` as Route);
      }
      return actionResult(result, editPath(id), "");
    },

    async move(id: string, offset: -1 | 1): Promise<FormState> {
      const result = await commands().move(await getCurrentStaff(), id, offset);
      return actionResult(
        result,
        basePath,
        offset < 0 ? "Moved up." : "Moved down.",
      );
    },
  };
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
