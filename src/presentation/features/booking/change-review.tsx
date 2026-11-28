"use client";

import { useEffect, useRef } from "react";

import type { MoneyDto } from "@/contracts/api/v1/primitives";
import { formatMoney } from "@/presentation/format/money";
import {
  alertBox,
  bookingBlock,
  bookingHeading,
  bookingSubheading,
  button,
  factTerm,
  factValue,
  figures,
} from "@/presentation/site/classes";

import type { ChangeFact } from "./change-state";
import type { Quote } from "./extras-state";
import { QuoteTable } from "./price-summary";

/** A preview the server priced and that can be confirmed. */
export type Priced = Readonly<{
  current: Quote;
  proposed: Quote;
  outcome: "APPLIES_NOW" | "NEEDS_APPROVAL";
}>;

function outcomeText(preview: Priced, payAtHotel: boolean) {
  if (preview.outcome === "NEEDS_APPROVAL")
    return "The new total differs from what you paid online, so the hotel must approve this change. Nothing changes until then, including your details. Any difference is settled at the hotel.";
  return payAtHotel
    ? "Your booking changes as soon as you confirm. You pay the new total at the hotel."
    : "Your booking changes as soon as you confirm. The total you paid stays the same.";
}

/** Step two: what changes, and the server's current and new price. */
export function ChangeReview({
  preview,
  facts,
  payAtHotel,
  oldPrice,
  problem,
  busy,
  onAccept,
  onConfirm,
  onBack,
}: Readonly<{
  preview: Priced;
  facts: readonly ChangeFact[];
  payAtHotel: boolean;
  /** The total shown before the price changed, until the new one is accepted. */
  oldPrice: MoneyDto | null;
  /** Why the change cannot be sent yet; the button waits meanwhile. */
  problem: Readonly<{ text: string }> | null;
  busy: boolean;
  onAccept: () => void;
  onConfirm: () => void;
  onBack: () => void;
}>) {
  const heading = useRef<HTMLHeadingElement>(null);
  const alert = useRef<HTMLDivElement>(null);
  const totals = useRef<HTMLDListElement>(null);
  const hadOldPrice = useRef(false);

  // In this order: a changed price or a refusal takes the focus.
  useEffect(() => heading.current?.focus(), []);
  useEffect(() => {
    if (oldPrice) alert.current?.focus();
    // The accept button removes itself, so focus moves to the totals.
    else if (hadOldPrice.current) totals.current?.focus();
    hadOldPrice.current = oldPrice !== null;
  }, [oldPrice]);
  useEffect(() => {
    if (problem) alert.current?.focus();
  }, [problem]);

  const current = ["Current", preview.current] as const;
  const proposed = ["New", preview.proposed] as const;
  const sides = [current, proposed] as const;

  return (
    <div className="grid min-w-0 gap-5">
      <h2 ref={heading} tabIndex={-1} className={bookingHeading}>
        Check your changes
      </h2>
      {(oldPrice || problem) && (
        <div
          ref={alert}
          role="alert"
          tabIndex={-1}
          className={`${alertBox} grid gap-1`}
        >
          {oldPrice && (
            <p className="m-0">
              The price changed. The new total is now{" "}
              {formatMoney(preview.proposed.total)} instead of{" "}
              {formatMoney(oldPrice)}.
            </p>
          )}
          {problem && <p className="m-0 text-danger">{problem.text}</p>}
        </div>
      )}
      <dl
        ref={totals}
        tabIndex={-1}
        className="m-0 grid min-w-0 gap-3 sm:grid-cols-2"
      >
        {sides.map(([side, quote]) => (
          <div
            key={side}
            className="grid min-w-0 gap-1 border-l-2 border-gold-400 bg-canvas px-4 py-3"
          >
            <dt className={factTerm}>{side} total with VAT</dt>
            <dd className={`${figures} m-0 text-heading-lg`}>
              {formatMoney(quote.total)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="m-0">{outcomeText(preview, payAtHotel)}</p>
      <div className={bookingBlock}>
        <h3 className={bookingSubheading}>What changes</h3>
        <dl className="m-0 grid min-w-0 gap-4">
          {facts.map((fact) => (
            <div key={fact.label} className="grid min-w-0 gap-0.5">
              <dt className={factTerm}>{fact.label}</dt>
              <dd className={`${factValue} text-neutral-600`}>
                Now: {fact.before}
              </dd>
              <dd className={`${factValue} font-medium`}>New: {fact.after}</dd>
            </div>
          ))}
        </dl>
      </div>
      {[proposed, current].map(([side, quote]) => (
        <div key={side} className={bookingBlock}>
          <h3 className={bookingSubheading}>{side} price</h3>
          <QuoteTable quote={quote} caption={`${side} price`} nightly />
        </div>
      ))}
      <p className="m-0 text-small text-neutral-600">
        Nights you keep in the same room or apartment keep their price. Added
        nights and units use today’s prices.
      </p>
      <div className="flex flex-wrap gap-3 max-sm:*:w-full">
        {oldPrice ? (
          <button
            key="accept"
            type="button"
            className={button("primary")}
            onClick={onAccept}
          >
            Accept new total
          </button>
        ) : (
          <button
            key="confirm"
            type="button"
            aria-disabled={busy || problem ? true : undefined}
            className={button("primary", "aria-disabled:opacity-70")}
            onClick={(event) => {
              // The second click of a double click on the button this one
              // replaced must not send the change.
              if (event.detail <= 1) onConfirm();
            }}
          >
            {busy
              ? "Sending…"
              : preview.outcome === "NEEDS_APPROVAL"
                ? "Send to the hotel for approval"
                : "Confirm change"}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          className={button("ghost")}
          onClick={onBack}
        >
          Back to the form
        </button>
      </div>
    </div>
  );
}
