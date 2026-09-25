"use client";

import { useEffect } from "react";

// Past this depth, scrolling down tucks the header away and scrolling up
// brings it back. It always returns when it holds focus or the menu is open.
const TUCK_AFTER = 480;
// Ignore jitter from trackpads and momentum scrolling.
const DIRECTION_THRESHOLD = 6;

// Progressive enhancement for the header. Without JavaScript it scrolls
// away with the page (always readable over the hero). With JavaScript it
// stays fixed, switches to the light surface once the page scrolls, tucks
// away while reading downwards, and shows reading progress as a gold rule.
export function HeaderState() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".site-header");
    if (!header) return;
    let frame = 0;
    let lastY = window.scrollY;
    const update = () => {
      frame = 0;
      const y = Math.max(window.scrollY, 0);
      const scrollable =
        document.documentElement.scrollHeight - window.innerHeight;
      header.dataset.scrolled = String(y > 24);
      header.style.setProperty(
        "--scroll-progress",
        scrollable > 0 ? Math.min(y / scrollable, 1).toFixed(4) : "0",
      );
      const delta = y - lastY;
      if (Math.abs(delta) < DIRECTION_THRESHOLD) return;
      const pinned =
        header.matches(":focus-within") ||
        header.querySelector(".site-menu[open]") !== null;
      header.dataset.tucked = String(!pinned && delta > 0 && y > TUCK_AFTER);
      lastY = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onFocus = () => {
      header.dataset.tucked = "false";
    };
    update();
    header.dataset.enhanced = "true";
    window.addEventListener("scroll", onScroll, { passive: true });
    header.addEventListener("focusin", onFocus);
    return () => {
      window.removeEventListener("scroll", onScroll);
      header.removeEventListener("focusin", onFocus);
      cancelAnimationFrame(frame);
      delete header.dataset.enhanced;
      delete header.dataset.tucked;
    };
  }, []);
  return null;
}
