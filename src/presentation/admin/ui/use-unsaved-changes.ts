"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Warns before the browser leaves a page with unsaved edits (reload, tab
 * close, external navigation). In-app links are not intercepted, so the
 * warning can never trap someone inside the admin.
 */
export function useUnsavedChanges() {
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Stable identities: callers list these in effect dependencies, and a new
  // function each render would re-run those effects (e.g. repeat a toast).
  const markDirty = useCallback(() => setDirty(true), []);
  const markSaved = useCallback(() => setDirty(false), []);

  return { dirty, markDirty, markSaved };
}
