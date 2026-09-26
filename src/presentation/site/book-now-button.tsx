"use client";

import { useId, useState } from "react";

import { actionFill, button, headerButton } from "@/presentation/site/classes";

const STATUS = {
  header:
    "absolute top-[calc(100%+0.5rem)] right-0 z-5 w-max max-w-[20rem] bg-surface px-4 py-3 text-[0.8125rem] leading-[1.45] text-neutral-800 shadow-[var(--shadow-md)]",
  dark: "max-w-[20rem] text-[0.8125rem] leading-[1.45] text-inverse-strong",
  light: "max-w-[20rem] text-[0.8125rem] leading-[1.45]",
} as const;

// Booking is not connected yet. This control is deliberately inert: it is
// a real button (never a link), goes nowhere, submits nothing, and explains
// how to book instead. aria-disabled keeps it focusable so keyboard and
// screen-reader users can discover the explanation.
export function BookNowButton({
  message,
  label = "Book now",
  placement = "light",
  fill = false,
  inActions = false,
}: Readonly<{
  message: string;
  label?: string;
  /** The surface it sits on: the header, a plum hero, or the light page. */
  placement?: keyof typeof STATUS;
  /** Full width (the room page's booking panel). */
  fill?: boolean;
  /** In a row of actions, which it fills on phones. */
  inActions?: boolean;
}>) {
  const [announced, setAnnounced] = useState(false);
  const statusId = useId();
  const width = fill ? "w-full" : inActions ? actionFill : "";
  const buttonClass =
    placement === "header"
      ? headerButton
      : button(placement === "dark" ? "primary-dark" : "primary", width);
  return (
    <span
      data-book-now=""
      className={`relative inline-grid gap-2 ${width}`.trim()}
    >
      <button
        type="button"
        className={`${buttonClass} aria-disabled:cursor-not-allowed`}
        aria-disabled="true"
        aria-describedby={statusId}
        data-booking="unavailable"
        onClick={() => setAnnounced(true)}
      >
        {label}
      </button>
      <span
        id={statusId}
        role="status"
        className={announced ? STATUS[placement] : "visually-hidden"}
      >
        {message}
      </span>
    </span>
  );
}
