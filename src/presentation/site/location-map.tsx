import type { PublicSettings } from "@/application/public/view-models";
import { Icon } from "@/presentation/site/icons";
import { SunRays } from "@/presentation/site/ornaments";
import { link, linkIcon } from "@/presentation/site/classes";

// The embed is optional and lazy; the address and a plain link always work,
// including without third-party frames.
export function LocationMap({
  settings,
}: Readonly<{ settings: PublicSettings }>) {
  const directions =
    settings.latitude !== null && settings.longitude !== null
      ? `https://www.google.com/maps/search/?api=1&query=${settings.latitude},${settings.longitude}`
      : settings.addressLines.length > 0
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.addressLines.join(", "))}`
        : null;
  if (!settings.mapEmbedUrl && !directions) return null;
  return (
    <div className="grid gap-4">
      {settings.mapEmbedUrl ? (
        <iframe
          src={settings.mapEmbedUrl}
          title={`Map showing ${settings.siteName}`}
          loading="lazy"
          className="aspect-[4/3] min-h-80 w-full border-0"
          referrerPolicy="no-referrer-when-downgrade"
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
      ) : (
        <div className="relative grid aspect-[4/3] min-h-80 w-full place-items-center content-center gap-4 overflow-hidden border-0 bg-plum-900 bg-[radial-gradient(ellipse_at_50%_40%,rgb(101_42_76/0.8),transparent_65%)] p-8 text-center text-surface">
          <SunRays className="absolute w-[min(80%,26rem)] text-gold-400 opacity-18" />
          <Icon name="pin" className="relative size-10 text-gold-400" />
          {settings.addressLines.length > 0 ? (
            <p className="relative m-0 max-w-[22rem] font-display text-heading-md text-inverse-strong">
              {settings.addressLines.join(", ")}
            </p>
          ) : null}
        </div>
      )}
      {directions ? (
        <p className="m-0">
          <a
            href={directions}
            rel="noopener noreferrer"
            target="_blank"
            aria-label="Open directions in Google Maps (opens in a new tab)"
            className={link}
          >
            Open directions in Google Maps
            <Icon name="arrow" className={linkIcon} />
          </a>
        </p>
      ) : null}
    </div>
  );
}
