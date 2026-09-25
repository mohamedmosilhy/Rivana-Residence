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
    <li className="admin-stat">
      <Link href={href} className="admin-stat__link">
        <span className="admin-stat__title">{title}</span>
        <span className="admin-stat__value">{value}</span>
        <span className="admin-stat__detail">{detail}</span>
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
      <section className="admin-section" aria-labelledby="attention-title">
        <h2 id="attention-title" className="admin-section__title">
          Needs attention
        </h2>
        {attention.length > 0 ? (
          <ul className="admin-attention">
            {attention.map((item) => (
              <li key={item.text}>
                <Link href={item.href}>{item.text}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="admin-muted">Nothing needs attention right now.</p>
        )}
      </section>

      <section className="admin-section" aria-labelledby="content-title">
        <h2 id="content-title" className="admin-section__title">
          Content
        </h2>
        <ul className="admin-stats">
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

      <section className="admin-section" aria-labelledby="recent-title">
        <h2 id="recent-title" className="admin-section__title">
          Recently updated
        </h2>
        {overview.recent.length === 0 ? (
          <EmptyState title="Nothing has been edited yet">
            <p>
              Changes to pages, rooms, facilities, and promotions show here.
            </p>
          </EmptyState>
        ) : (
          <ul className="admin-recent">
            {overview.recent.map((item) => {
              const kind = KIND[item.kind];
              const linked = item.kind !== "SETTINGS" || canEditSettings;
              return (
                <li key={`${item.kind}:${item.id}`}>
                  <div className="admin-recent__main">
                    {linked ? (
                      <Link href={kind.href}>{item.title}</Link>
                    ) : (
                      <span>{item.title}</span>
                    )}
                    <span className="admin-recent__kind">{kind.label}</span>
                  </div>
                  <div className="admin-recent__meta">
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
