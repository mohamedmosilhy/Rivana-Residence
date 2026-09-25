"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";

import { SubmitButton } from "@/presentation/admin/ui/form";
import {
  idleFormState,
  type FormAction,
} from "@/presentation/admin/ui/form-state";
import { useToast } from "@/presentation/admin/ui/toast";

type ConfirmActionProps = Readonly<{
  triggerLabel: string;
  /** Names the target, e.g. "Publish Nile Suite?" */
  title: string;
  /** States the consequence, including public impact. */
  children: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  action: FormAction;
  tone?: "primary" | "secondary" | "danger";
}>;

// A confirmation for a server action that can fail (for example, a publish
// blocked by readiness issues). The dialog stays open and shows the reason
// on failure; on success it closes and announces the result.
export function ConfirmAction({
  triggerLabel,
  title,
  children,
  confirmLabel,
  pendingLabel,
  action,
  tone = "secondary",
}: ConfirmActionProps) {
  const [state, formAction] = useActionState(action, idleFormState);
  const toast = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (state.status === "success") {
      dialogRef.current?.close();
      toast(state.message);
    } else if (state.status === "error") {
      errorRef.current?.focus();
    }
  }, [state, toast]);

  const triggerClass =
    tone === "primary"
      ? "admin-button"
      : tone === "danger"
        ? "admin-button admin-button--danger-quiet"
        : "admin-button admin-button--secondary";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClass}
        aria-haspopup="dialog"
        onClick={() => {
          dialogRef.current?.showModal();
          cancelRef.current?.focus();
        }}
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
        {state.status === "error" ? (
          <div
            ref={errorRef}
            className="admin-error-summary admin-dialog__error"
            role="alert"
            tabIndex={-1}
          >
            <p>{state.message}</p>
            {state.fieldErrors ? (
              <ul>
                {Object.values(state.fieldErrors)
                  .flat()
                  .map((message) => (
                    <li key={message}>{message}</li>
                  ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <form className="admin-dialog__actions" action={formAction}>
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
            variant={tone === "danger" ? "danger" : "primary"}
          >
            {confirmLabel}
          </SubmitButton>
        </form>
      </dialog>
    </>
  );
}
