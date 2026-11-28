"use client";

import { useEffect, useEffectEvent, useState } from "react";

import {
  getGuestReservation,
  type GuestAccess,
} from "@/presentation/api-client/guest";
import type { ApiProblem } from "@/presentation/api-client/result";

import type { BookingDetail } from "./booking-details";

/** Why the guest's key no longer opens this booking. */
export type AccessRefusal = "gone" | "session" | "blocked";

/**
 * Null when the problem says nothing about the key itself. Only the API's own
 * code counts: a proxy's error page with the same status must not end a key.
 */
export function accessRefusal(
  problem: ApiProblem,
  kind: GuestAccess["kind"],
): AccessRefusal | null {
  switch (problem.code) {
    case "PHONE_BLOCKED":
      return "blocked";
    case "UNAUTHENTICATED":
    case "PHONE_NOT_VERIFIED":
      return kind === "SESSION" ? "session" : "gone";
    case "NOT_FOUND":
      return "gone";
    default:
      return null;
  }
}

/**
 * The booking as the server holds it now (API-G1 or G4). A later read that
 * fails keeps the last answer on screen and reports the failure beside it.
 * Mount a new instance for another booking.
 */
export function useGuestReservation(
  access: GuestAccess,
  onRefused: (refusal: AccessRefusal) => void,
) {
  const [round, setRound] = useState(0);
  const [state, setState] = useState<
    Readonly<{
      booking: BookingDetail | null;
      loading: boolean;
      /** Seconds the server asked us to wait; null when the read worked. */
      failedWait: number | null;
    }>
  >({ booking: null, loading: true, failedWait: null });

  const read = useEffectEvent(async (signal: AbortSignal) => {
    const result = await getGuestReservation(access, { signal });
    if (signal.aborted) return;
    if (result.ok) {
      setState({ booking: result.data, loading: false, failedWait: null });
      return;
    }
    const refusal = accessRefusal(result.problem, access.kind);
    if (refusal) return onRefused(refusal);
    setState((last) => ({
      booking: last.booking,
      loading: false,
      failedWait: result.problem.retryAfter ?? 0,
    }));
  });

  useEffect(() => {
    const controller = new AbortController();
    // Deferred, so a mount that is undone at once sends nothing.
    const timer = setTimeout(() => void read(controller.signal), 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [round]);

  function reload() {
    setState((last) => ({
      booking: last.booking,
      loading: true,
      failedWait: null,
    }));
    setRound((value) => value + 1);
  }

  return { ...state, reload };
}
