"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  idleFormState,
  type FormAction,
} from "@/presentation/admin/ui/form-state";
import { useToast } from "@/presentation/admin/ui/toast";

type OrderControlsProps = Readonly<{
  id: string;
  name: string;
  isFirst: boolean;
  isLast: boolean;
  moveUp: FormAction;
  moveDown: FormAction;
}>;

function MoveButton({
  id,
  label,
  disabled,
  action,
  text,
}: Readonly<{
  id: string;
  label: string;
  disabled: boolean;
  action: FormAction;
  text: string;
}>) {
  const [state, formAction, pending] = useActionState(action, idleFormState);
  const toast = useToast();
  const handled = useRef(state);

  useEffect(() => {
    if (state === handled.current || state.status === "idle") return;
    handled.current = state;
    toast(state.message, state.status === "error" ? "error" : "success");
    // The row moved, so bring focus back to this row's control.
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }, [state, toast, id]);

  return (
    <form action={formAction}>
      <button
        type="submit"
        id={id}
        className="admin-button admin-button--quiet"
        aria-label={label}
        disabled={disabled || pending}
      >
        {text}
      </button>
    </form>
  );
}

// Moves one record within the public display order.
export function OrderControls({
  id,
  name,
  isFirst,
  isLast,
  moveUp,
  moveDown,
}: OrderControlsProps) {
  return (
    <div className="admin-order-controls">
      <MoveButton
        id={`order-${id}-up`}
        label={`Move up: ${name}`}
        disabled={isFirst}
        action={moveUp}
        text="Up"
      />
      <MoveButton
        id={`order-${id}-down`}
        label={`Move down: ${name}`}
        disabled={isLast}
        action={moveDown}
        text="Down"
      />
    </div>
  );
}
