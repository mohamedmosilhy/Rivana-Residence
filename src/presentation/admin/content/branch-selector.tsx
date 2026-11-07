import type { Route } from "next";

import type { BranchChoice } from "@/application/branches";
import { button, control, fieldLabel } from "@/presentation/admin/ui/classes";

/**
 * The CMS branch selector (spec 0002): a GET form, so it works without
 * JavaScript and the choice lives in the URL (`?branch=<slug>`). The server
 * re-resolves the slug on every request.
 */
export function BranchSelector({
  action,
  choice,
}: Readonly<{ action: Route; choice: BranchChoice }>) {
  if (!choice.selected) return null;
  return (
    <form
      action={action}
      className="mb-5 flex flex-wrap items-end gap-4 border-b border-neutral-300 pb-5"
      data-branch-selector=""
    >
      <div className="grid min-w-[min(100%,16rem)] content-start gap-2">
        <label htmlFor="branch-selector" className={fieldLabel}>
          Branch
        </label>
        <select
          id="branch-selector"
          name="branch"
          defaultValue={choice.selected.slug}
          className={control}
        >
          {choice.branches.map((branch) => (
            <option key={branch.slug} value={branch.slug}>
              {branch.name}
              {branch.status === "INACTIVE" ? " (inactive)" : ""}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className={button("secondary")}>
        Show branch
      </button>
    </form>
  );
}

/** `?branch=<slug>` for links that must keep the selected branch. */
export function branchQuery(choice: BranchChoice) {
  return choice.selected
    ? `branch=${encodeURIComponent(choice.selected.slug)}`
    : "";
}
