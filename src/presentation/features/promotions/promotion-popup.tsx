"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { PublicPromotion } from "@/application/public/view-models";
import { PromotionCard } from "@/presentation/features/promotions/promotion-card";

const STORAGE_KEY = "rivana.promotion.dismissed";
const DISMISS_DAYS = 7;
// Appear after the page is usable, never before or during first paint.
const SHOW_DELAY_MS = 1500;

type Dismissal = {
  promotionId: string;
  version: number;
  dismissedUntil: number;
};

function readDismissal(): Dismissal | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Dismissal) : null;
  } catch {
    return null;
  }
}

function isDismissed(promotion: PublicPromotion) {
  const dismissal = readDismissal();
  return (
    dismissal?.promotionId === promotion.id &&
    dismissal.version === promotion.version &&
    dismissal.dismissedUntil > Date.now()
  );
}

/**
 * The single active campaign as a labelled modal dialog. It stores only the
 * promotion id, version, and dismissal expiry in the browser; a new version
 * of the campaign shows again.
 */
export function PromotionPopup({
  promotion,
}: Readonly<{ promotion: PublicPromotion }>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const headingId = useId();
  const statusId = useId();

  useEffect(() => {
    if (isDismissed(promotion)) return;
    const timer = window.setTimeout(() => {
      const dialog = dialogRef.current;
      if (!dialog || dialog.open) return;
      returnFocus.current = document.activeElement;
      dialog.showModal();
    }, SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [promotion]);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          promotionId: promotion.id,
          version: promotion.version,
          dismissedUntil: Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000,
        } satisfies Dismissal),
      );
    } catch {
      // Storage may be unavailable; the popup simply shows again next visit.
    }
  }, [promotion]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(promotion.code);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="promotion-popup"
      aria-labelledby={headingId}
      onClose={() => {
        dismiss();
        if (returnFocus.current instanceof HTMLElement)
          returnFocus.current.focus();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <PromotionCard
        headingId={headingId}
        headline={promotion.headline}
        body={promotion.body}
        code={promotion.code}
        terms={promotion.terms}
      />
      <div className="promotion-popup__actions">
        <button
          type="button"
          className="site-button"
          onClick={copy}
          aria-describedby={statusId}
        >
          Copy code
        </button>
        <button
          type="button"
          className="site-button site-button--quiet"
          onClick={() => dialogRef.current?.close()}
        >
          Close
        </button>
      </div>
      <p id={statusId} role="status" className="promotion-popup__status">
        {copyState === "copied"
          ? `Code ${promotion.code} copied.`
          : copyState === "failed"
            ? "Copying isn't available here. Select the code above and copy it."
            : ""}
      </p>
    </dialog>
  );
}
