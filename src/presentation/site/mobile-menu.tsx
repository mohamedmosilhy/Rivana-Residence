"use client";

import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { container } from "@/presentation/site/classes";

const CLOSE_DURATION = 420;
const FOCUSABLE =
  "summary, a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])";

/**
 * Makes everything outside `element` inert (each ancestor's siblings, up to
 * <body>) and returns what it changed so it can be restored.
 */
function inertOutside(element: HTMLElement) {
  const changed: HTMLElement[] = [];
  for (
    let node = element;
    node.parentElement && node !== document.body;
    node = node.parentElement
  ) {
    for (const sibling of node.parentElement.children) {
      if (
        sibling !== node &&
        sibling instanceof HTMLElement &&
        !sibling.inert &&
        sibling.tagName !== "SCRIPT"
      ) {
        sibling.inert = true;
        changed.push(sibling);
      }
    }
  }
  return changed;
}

// A <details> disclosure: it opens and closes without JavaScript, and is
// announced as expandable. With JavaScript it becomes a modal sheet: the
// rest of the page is inert, Tab stays inside, Escape or a click on the
// empty backdrop closes it, focus returns to the toggle, and it closes
// after navigating. Opening and closing are animated unless reduced motion
// is requested.
export function MobileMenu({ children }: Readonly<{ children: ReactNode }>) {
  const ref = useRef<HTMLDetailsElement>(null);
  const inerted = useRef<HTMLElement[]>([]);
  const closing = useRef(0);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const release = useCallback(() => {
    for (const element of inerted.current) element.inert = false;
    inerted.current = [];
  }, []);

  const close = useCallback(({ animate = true, returnFocus = true } = {}) => {
    const details = ref.current;
    if (!details?.open || closing.current) return;
    const finish = () => {
      closing.current = 0;
      delete details.dataset.closing;
      details.open = false;
      if (returnFocus) details.querySelector("summary")?.focus();
    };
    const reduce =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (!animate || reduce) return finish();
    details.dataset.closing = "true";
    closing.current = window.setTimeout(finish, CLOSE_DURATION);
  }, []);

  useEffect(() => {
    close({ animate: false, returnFocus: false });
  }, [pathname, close]);

  useEffect(
    () => () => {
      window.clearTimeout(closing.current);
      release();
    },
    [release],
  );

  const onToggle = () => {
    const details = ref.current;
    if (!details) return;
    setOpen(details.open);
    release();
    if (!details.open) return;
    inerted.current = inertOutside(details);
  };

  return (
    <details
      ref={ref}
      data-site-menu=""
      className="hidden max-lg:block"
      onToggle={onToggle}
      onKeyDown={(event) => {
        const details = ref.current;
        if (!details?.open) return;
        if (event.key === "Escape") {
          event.preventDefault();
          close();
          return;
        }
        if (event.key !== "Tab") return;
        const focusable = [
          ...details.querySelectorAll<HTMLElement>(FOCUSABLE),
        ].filter((element) => element.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        // The empty backdrop of the sheet, not a link or the contact list.
        if (target.hasAttribute("data-menu-backdrop")) {
          close();
        }
      }}
    >
      <summary
        className="inline-flex min-h-11 min-w-11 cursor-pointer [list-style:none] items-center justify-center gap-3 p-2 text-[0.75rem] font-medium tracking-[0.18em] uppercase [&::-webkit-details-marker]:hidden"
        onClick={(event) => {
          if (ref.current?.open) {
            event.preventDefault();
            close();
          }
        }}
      >
        <span
          aria-hidden="true"
          className="relative block h-2 w-6 before:absolute before:top-0 before:left-0 before:h-px before:w-full before:bg-current before:[transition:transform_var(--motion-surface)_var(--ease-out-soft)] after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:bg-current after:[transition:transform_var(--motion-surface)_var(--ease-out-soft)] menu-open:before:[transform:translateY(0.25rem)_rotate(45deg)] menu-open:after:[transform:translateY(-0.25rem)_rotate(-45deg)]"
        />
        <span className="max-[24rem]:absolute max-[24rem]:size-px max-[24rem]:overflow-hidden max-[24rem]:[clip-path:inset(50%)] max-[24rem]:whitespace-nowrap">
          {open ? "Close" : "Menu"}
        </span>
      </summary>
      <div
        data-menu-backdrop=""
        className="fixed inset-0 -z-1 overflow-y-auto bg-plum-950 bg-[radial-gradient(ellipse_at_85%_10%,rgb(101_42_76/0.85),transparent_55%)] text-surface menu-open:animate-[site-sheet-in_640ms_var(--ease-out-soft)_both] menu-closing:animate-[site-sheet-out_420ms_cubic-bezier(0.7,0,0.84,0)_both] [[data-site-menu]:not([open])_&]:hidden"
      >
        <div
          data-menu-backdrop=""
          className={`${container} grid min-h-full content-between gap-10 pt-[calc(var(--header-height)+2rem)] pb-10`}
        >
          {children}
        </div>
      </div>
    </details>
  );
}
