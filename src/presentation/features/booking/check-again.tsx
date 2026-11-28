"use client";

import { useEffect, useState } from "react";

import { button } from "@/presentation/site/classes";

/** Browser timers have a signed 32 bit delay limit. */
export const longestTimer = 2_147_483_647;

/** Tries a read again, after the wait the server asked for. */
export function CheckAgain({
  waitSeconds,
  onClick,
}: Readonly<{ waitSeconds: number; onClick: () => void }>) {
  const [waiting, setWaiting] = useState(waitSeconds > 0);
  useEffect(() => {
    if (waitSeconds <= 0) return;
    const timer = setTimeout(
      () => setWaiting(false),
      Math.min(waitSeconds * 1000, longestTimer),
    );
    return () => clearTimeout(timer);
  }, [waitSeconds]);
  return (
    <>
      {waiting && (
        <p className="m-0 text-small text-neutral-600">
          The website is busy. You can check again when the button is available.
        </p>
      )}
      <button
        type="button"
        className={button("primary", "justify-self-start max-sm:w-full")}
        disabled={waiting}
        onClick={onClick}
      >
        Check again
      </button>
    </>
  );
}
