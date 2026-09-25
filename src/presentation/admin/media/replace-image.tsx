"use client";

import { useState } from "react";

import { Uploader } from "@/presentation/admin/media/uploader";
import { ConfirmAction } from "@/presentation/admin/ui/confirm-action";
import type { FormAction } from "@/presentation/admin/ui/form-state";

// Replacement uploads and verifies a new image first; only after that
// succeeds are references switched over, after a confirmation that says
// where the change will appear.
export function ReplaceImage({
  action,
  usageCount,
  publicUsageCount,
}: Readonly<{
  action: FormAction;
  usageCount: number;
  publicUsageCount: number;
}>) {
  const [newId, setNewId] = useState<string | null>(null);
  return (
    <div className="admin-replace">
      <Uploader
        multiple={false}
        label="Upload the replacement"
        onUploaded={setNewId}
      />
      {newId ? (
        <ConfirmAction
          triggerLabel="Use the new image everywhere"
          title="Replace this image everywhere it is used?"
          confirmLabel="Replace"
          pendingLabel="Replacing…"
          tone="primary"
          fields={{ toId: newId }}
          action={action}
        >
          <p>
            {usageCount === 0
              ? "This image is not used anywhere, so nothing changes on the website."
              : `The new image takes its place in ${usageCount} place${usageCount === 1 ? "" : "s"}${publicUsageCount > 0 ? `, ${publicUsageCount} of them on the public website` : ""}.`}{" "}
            The old image stays in the library until you delete it.
          </p>
        </ConfirmAction>
      ) : null}
    </div>
  );
}
