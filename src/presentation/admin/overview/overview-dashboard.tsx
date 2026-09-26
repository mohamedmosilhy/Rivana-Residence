import type { Route } from "next";
import Link from "next/link";

import type {
  AdminOverviewDto,
  PublicationCounts,
  RecentContentKind,
} from "@/application/ports/repositories";
import { formatDateTime, plural } from "@/presentation/admin/format";
import { Badge, PublicationBadge } from "@/presentation/admin/ui/badge";
import { EmptyState } from "@/presentation/admin/ui/states";
import {
  muted,
  section as sectionClass,
  sectionTitle,
} from "@/presentation/admin/ui/classes";

const KIND: Record<RecentContentKind, { label: string; href: Route }> = {
  PAGE: { label: "Page", href: "/admin/pages" },
  ROOM: { label: "Room", href: "/admin/rooms" },
  FACILITY: { label: "Facility", href: "/admin/facilities" },
  PROMOTION: { label: "Promotion", href: "/admin/promotions" },
  SETTINGS: { label: "Settings", href: "/admin/settings" },
};

function publicationSummary(counts: PublicationCounts) {
  return `${counts.PUBLISHED} published · ${counts.DRAFT} draft${
    counts.ARCHIVED ? ` · ${counts.ARCHIVED} archived` : ""
  }`;
}

function StatCard({
  href,
  title,
  value,
  detail,
}: Readonly<{ href: Route; title: string; value: string; detail: string }>) {
  return (
    <li>
      <Link
        href={href}
        className="grid h-full content-start gap-1 rounded-panel border border-neutral-300 bg-surface p-5 [transition:border-color_var(--motion-fast)] hover:border-plum-700"
      >
        <span className="font-medium text-plum-700">{title}</span>
        <span className="text-[1.5rem] leading-[1.3] font-medium text-neutral-950">
          {value}
        </span>
        <span className="text-[0.875rem] text-neutral-600">{detail}</span>
      </Link>
    </li>
  );
}

type OverviewDashboardProps = Readonly<{
  overview: AdminOverviewDto;
  canEditSettings: boolean;
}>;

export function OverviewDashboard({
  overview,
  canEditSettings,
}: OverviewDashboardProps) {
  const { rooms, facilities, media, promotions, enquiries, timeZone } =
    overview;
  const when = (date: Date) => formatDateTime(date, timeZone);

  const attention = [
    enquiries.new > 0 && {
      href: "/admin/enquiries?status=NEW" as Route,
      text: `${plural(enquiries.new, "new enquiry", "new enquiries")} to read`,
    },
    enquiries.deliveryFailed > 0 && {
      href: "/admin/enquiries?status=DELIVERY_FAILED" as Route,
      text: `${plural(enquiries.deliveryFailed, "enquiry", "enquiries")} whose email notification failed`,
    },
    media.missingAltText > 0 && {
      href: "/admin/media" as Route,
      text: `${plural(media.missingAltText, "image")} missing alt text`,
    },
    media.failed > 0 && {
      href: "/admin/media" as Route,
      text: `${plural(media.failed, "upload")} failed`,
    },
  ].filter((item): item is { href: Route; text: string } => Boolean(item));

  const activeDetail = promotions.active
    ? `“${promotions.active.headline}”${
        promotions.active.endsAt
          ? ` until ${when(promotions.active.endsAt)}`
          : ", no end date"
      }`
    : "No promotion is showing on the website";

  return (
    <>
      <section className={sectionClass} aria-labelledby="attention-title">
        <h2 id="attention-title" className={sectionTitle}>
          Needs attention
        </h2>
        {attention.length > 0 ? (
          <ul className="grid gap-2">
            {attention.map((item) => (
              <li key={item.text}>
                <Link
                  href={item.href}
                  className="block rounded-control border border-l-4 border-neutral-300 border-l-warning bg-surface px-4 py-3 text-neutral-800 underline decoration-neutral-300 underline-offset-[0.2em]"
                >
                  {item.text}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={muted}>Nothing needs attention right now.</p>
        )}
      </section>

      <section className={sectionClass} aria-labelledby="content-title">
        <h2 id="content-title" className={sectionTitle}>
          Content
        </h2>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
          <StatCard
            href="/admin/pages"
            title="Pages"
            value={`${overview.pages.published} of ${overview.pages.total}`}
            detail="published"
          />
          <StatCard
            href="/admin/rooms"
            title="Rooms"
            value={String(rooms.PUBLISHED + rooms.DRAFT)}
            detail={publicationSummary(rooms)}
          />
          <StatCard
            href="/admin/facilities"
            title="Facilities"
            value={String(facilities.PUBLISHED + facilities.DRAFT)}
            detail={publicationSummary(facilities)}
          />
          <StatCard
            href="/admin/media"
            title="Media"
            value={String(media.ready)}
            detail={`ready images · ${media.missingAltText} missing alt text`}
          />
          <StatCard
            href="/admin/promotions"
            title="Promotions"
            value={promotions.active ? "Showing" : "None showing"}
            detail={`${activeDetail}. ${plural(promotions.scheduledCount, "scheduled promotion")}${
              promotions.nextScheduled
                ? `; next starts ${when(promotions.nextScheduled.startsAt)}`
                : ""
            }.`}
          />
          <StatCard
            href="/admin/enquiries"
            title="Enquiries"
            value={String(enquiries.new)}
            detail="new"
          />
        </ul>
      </section>

      <section className={sectionClass} aria-labelledby="recent-title">
        <h2 id="recent-title" className={sectionTitle}>
          Recently updated
        </h2>
        {overview.recent.length === 0 ? (
          <EmptyState title="Nothing has been edited yet">
            <p>
              Changes to pages, rooms, facilities, and promotions show here.
            </p>
          </EmptyState>
        ) : (
          <ul className="rounded-panel border border-neutral-300 bg-surface">
            {overview.recent.map((item) => {
              const kind = KIND[item.kind];
              const linked = item.kind !== "SETTINGS" || canEditSettings;
              return (
                <li
                  key={`${item.kind}:${item.id}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 not-first:border-t not-first:border-neutral-300"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    {linked ? (
                      <Link
                        href={kind.href}
                        className="font-medium text-neutral-950 underline decoration-neutral-300 underline-offset-[0.2em]"
                      >
                        {item.title}
                      </Link>
                    ) : (
                      <span>{item.title}</span>
                    )}
                    <span className="text-[0.875rem] text-neutral-600">
                      {kind.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[0.875rem] text-neutral-600">
                    {item.status ? (
                      <PublicationBadge status={item.status} />
                    ) : (
                      <Badge>Updated</Badge>
                    )}
                    <time dateTime={item.updatedAt.toISOString()}>
                      {when(item.updatedAt)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
