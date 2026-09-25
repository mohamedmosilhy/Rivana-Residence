"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import type { NavItem } from "@/presentation/admin/navigation";
import { AdminNav } from "@/presentation/admin/shell/admin-nav";
import { BrandMark } from "@/presentation/design/brand-mark";

// A modal sheet built on <dialog>: the browser supplies the focus trap,
// inert background, and Escape handling; focus returns to the trigger.
export function MobileNav({ items }: Readonly<{ items: readonly NavItem[] }>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    // Following a link inside the sheet closes it.
    if (dialogRef.current?.open) dialogRef.current.close();
  }, [pathname]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="admin-topbar__menu"
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
      >
        <span aria-hidden="true" className="admin-topbar__menu-icon" />
        Menu
      </button>
      <dialog
        ref={dialogRef}
        className="admin-sheet"
        aria-label="Admin menu"
        onClose={() => triggerRef.current?.focus()}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="admin-sheet__panel">
          <div className="admin-sheet__header">
            <BrandMark />
            <button
              type="button"
              className="admin-sheet__close"
              onClick={() => dialogRef.current?.close()}
            >
              Close menu
            </button>
          </div>
          <AdminNav items={items} label="Admin menu" />
        </div>
      </dialog>
    </>
  );
}
