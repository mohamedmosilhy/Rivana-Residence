"use client";

import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

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
      className="site-menu"
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
        if (
          target.classList.contains("site-menu__panel") ||
          target.classList.contains("site-menu__content")
        ) {
          close();
        }
      }}
    >
      <summary
        className="site-menu__toggle"
        onClick={(event) => {
          if (ref.current?.open) {
            event.preventDefault();
            close();
          }
        }}
      >
        <span aria-hidden="true" className="site-menu__icon" />
        <span className="site-menu__label">{open ? "Close" : "Menu"}</span>
      </summary>
      <div className="site-menu__panel">
        <div className="site-menu__content site-container">{children}</div>
      </div>
    </details>
  );
}
