"use client";

import { useEffect } from "react";

// Progressive enhancement for the header. Without JavaScript it scrolls
// away with the page (always readable over the hero). With JavaScript it
// stays fixed and switches to the light surface once the page scrolls.
export function HeaderState() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".site-header");
    if (!header) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      header.dataset.scrolled = String(window.scrollY > 24);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    header.dataset.enhanced = "true";
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      delete header.dataset.enhanced;
    };
  }, []);
  return null;
}
