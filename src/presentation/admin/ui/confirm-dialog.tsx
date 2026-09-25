"use client";

import { useId, useRef, type ReactNode } from "react";

import { SubmitButton } from "@/presentation/admin/ui/form";

type ConfirmDialogProps = Readonly<{
  /** Text of the button that opens the dialog. */
  triggerLabel: string;
  triggerDisabled?: boolean;
  /** Names the target, e.g. "Sign out 2 other sessions?" */
  title: string;
  /** States the consequence, including any public impact. */
  children: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  action: () => Promise<void>;
  destructive?: boolean;
}>;

// An alert dialog on <dialog>.showModal(): the rest of the page is inert,
// Escape cancels, and focus starts on the safe choice (Cancel) and returns
// to the trigger when the dialog closes.
export function ConfirmDialog({
  triggerLabel,
  triggerDisabled = false,
  title,
  children,
  confirmLabel,
  pendingLabel,
  action,
  destructive = true,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  function open() {
    dialogRef.current?.showModal();
    cancelRef.current?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`admin-button ${destructive ? "admin-button--danger-quiet" : "admin-button--secondary"}`}
        disabled={triggerDisabled}
        aria-haspopup="dialog"
        onClick={open}
      >
        {triggerLabel}
      </button>
      <dialog
        ref={dialogRef}
        className="admin-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onClose={() => triggerRef.current?.focus()}
      >
        <h2 id={titleId}>{title}</h2>
        <div id={bodyId} className="admin-dialog__body">
          {children}
        </div>
        <form
          className="admin-dialog__actions"
          action={async () => {
            await action();
            dialogRef.current?.close();
          }}
        >
          <button
            ref={cancelRef}
            type="button"
            className="admin-button admin-button--secondary"
            onClick={() => dialogRef.current?.close()}
          >
            Cancel
          </button>
          <SubmitButton
            pendingLabel={pendingLabel}
            variant={destructive ? "danger" : "primary"}
          >
            {confirmLabel}
          </SubmitButton>
        </form>
      </dialog>
    </>
  );
}
