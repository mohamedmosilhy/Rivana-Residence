"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

const menuItem =
  "block w-full cursor-pointer rounded-control border-0 bg-transparent px-3 py-2 text-left text-neutral-800 hover:bg-admin-canvas";

type AccountMenuProps = Readonly<{
  name: string;
  roleLabel: string;
  signOutAction: () => Promise<void>;
}>;

// A disclosure rather than an ARIA menu: its contents are ordinary links and
// a form button, so native Tab order is the expected keyboard model.
export function AccountMenu({
  name,
  roleLabel,
  signOutAction,
}: AccountMenuProps) {
  const pathname = usePathname();
  // Remembering where the menu was opened closes it after any navigation.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (value: boolean) => setOpenAt(value ? pathname : null);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpenAt(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenAt(null);
      buttonRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-transparent bg-transparent px-2 py-1 text-neutral-800 hover:border-neutral-300 aria-expanded:border-neutral-300"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${name}, account options`}
        onClick={() => setOpen(!open)}
      >
        <span
          className="grid size-8 place-items-center rounded-[50%] bg-plum-100 font-medium text-plum-800"
          aria-hidden="true"
        >
          {name.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <span className="max-[30rem]:absolute max-[30rem]:size-px max-[30rem]:overflow-hidden max-[30rem]:[clip:rect(0_0_0_0)] max-[30rem]:whitespace-nowrap">
          {name}
        </span>
      </button>
      <div
        id={panelId}
        className="absolute top-[calc(100%+0.5rem)] right-0 z-30 w-[min(16rem,calc(100vw-2rem))] rounded-panel border border-neutral-300 bg-surface p-2 shadow-[var(--shadow-md)]"
        hidden={!open}
      >
        <p className="grid border-b border-neutral-300 px-3 pt-2 pb-3 font-medium">
          <span>{name}</span>
          <span className="text-[0.8125rem] font-normal text-neutral-600">
            {roleLabel}
          </span>
        </p>
        <ul className="py-2">
          <li>
            <Link href="/admin/account" className={menuItem}>
              Account and security
            </Link>
          </li>
          <li>
            <Link href="/" className={menuItem}>
              View website
            </Link>
          </li>
        </ul>
        <form
          action={signOutAction}
          className="border-t border-neutral-300 pt-2"
        >
          <button type="submit" className={menuItem}>
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
