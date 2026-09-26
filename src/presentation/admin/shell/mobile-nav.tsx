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
        className="hidden min-h-11 cursor-pointer items-center gap-2 rounded-control border border-neutral-300 bg-surface px-3 py-2 text-neutral-800 max-lg:inline-flex"
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
      >
        <span
          aria-hidden="true"
          className="relative block h-0.5 w-4 rounded-[1px] bg-current before:absolute before:-top-[5px] before:left-0 before:block before:h-0.5 before:w-4 before:rounded-[1px] before:bg-current after:absolute after:top-[5px] after:left-0 after:block after:h-0.5 after:w-4 after:rounded-[1px] after:bg-current"
        />
        Menu
      </button>
      <dialog
        ref={dialogRef}
        className="m-0 h-full max-h-none w-[min(20rem,88vw)] max-w-none border-0 bg-plum-900 p-0 text-surface backdrop:bg-[rgb(31_27_29/0.5)]"
        aria-label="Admin menu"
        onClose={() => triggerRef.current?.focus()}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="grid gap-8 p-5">
          <div className="flex items-center justify-between gap-4">
            <BrandMark inverse />
            <button
              type="button"
              className="min-h-11 cursor-pointer rounded-control border border-inverse-line-strong bg-transparent px-3 py-2 text-surface"
              onClick={() => dialogRef.current?.close()}
            >
              Close menu
            </button>
          </div>
          <AdminNav items={items} label="Admin menu" inSheet />
        </div>
      </dialog>
    </>
  );
}
