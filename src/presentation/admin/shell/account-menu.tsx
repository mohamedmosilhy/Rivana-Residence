"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

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
    <div className="admin-account-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="admin-account-menu__trigger"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${name}, account options`}
        onClick={() => setOpen(!open)}
      >
        <span className="admin-account-menu__avatar" aria-hidden="true">
          {name.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <span className="admin-account-menu__name">{name}</span>
      </button>
      <div id={panelId} className="admin-account-menu__panel" hidden={!open}>
        <p className="admin-account-menu__identity">
          <span>{name}</span>
          <span className="admin-account-menu__role">{roleLabel}</span>
        </p>
        <ul>
          <li>
            <Link href="/admin/account">Account and security</Link>
          </li>
          <li>
            <Link href="/">View website</Link>
          </li>
        </ul>
        <form action={signOutAction}>
          <button type="submit" className="admin-account-menu__signout">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
