import type { Route } from "next";
import Link from "next/link";

import type { PromotionDisplayState } from "@/application/promotions/promotion-admin";
import type { PromotionDto } from "@/application/ports/repositories";
import { formatDateTime } from "@/presentation/admin/format";

const winnerLink = (winner: PromotionDto) => (
  <Link href={`/admin/promotions/${winner.id}` as Route} className="admin-link">
    {winner.internalName}
  </Link>
);

function reason(winner: PromotionDto, priority: number) {
  return winner.priority > priority
    ? `it has a higher priority (${winner.priority}, this one ${priority})`
    : "it has the same priority and was published more recently";
}

// Explains the public selection rule for this promotion in plain words.
export function DisplayNote({
  display,
  priority,
  timeZone,
}: Readonly<{
  display: PromotionDisplayState;
  priority: number;
  timeZone: string;
}>) {
  let message: React.ReactNode;
  switch (display.state) {
    case "showing":
      message = "This promotion is showing on the website now.";
      break;
    case "would-show":
      message =
        "If you publish it now, this promotion will show on the website.";
      break;
    case "outranked":
      message = (
        <>
          Published but not showing: {winnerLink(display.winner)} is shown
          instead because {reason(display.winner, priority)}.
        </>
      );
      break;
    case "would-be-outranked":
      message = (
        <>
          If you publish it now, {winnerLink(display.winner)} will still show
          instead because {reason(display.winner, priority)}.
        </>
      );
      break;
    case "popup-off":
      message = "The pop-up is turned off, so this promotion never shows.";
      break;
    case "scheduled":
      message = `Scheduled: it can start showing at ${formatDateTime(display.startsAt, timeZone)}.`;
      break;
    case "expired":
      message = "Its end time has passed, so it no longer shows.";
      break;
    case "archived":
      message = "Archived promotions never show.";
      break;
  }
  return (
    <p className="admin-display-note" role="note">
      {message}
    </p>
  );
}
