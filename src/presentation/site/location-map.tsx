import type { PublicSettings } from "@/application/public/view-models";
import { Icon } from "@/presentation/site/icons";
import { SunRays } from "@/presentation/site/ornaments";

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
    <div className="site-map">
      {settings.mapEmbedUrl ? (
        <iframe
          src={settings.mapEmbedUrl}
          title={`Map showing ${settings.siteName}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
      ) : (
        <div className="site-map__placeholder">
          <SunRays className="site-map__rays" />
          <Icon name="pin" className="site-map__pin" />
          {settings.addressLines.length > 0 ? (
            <p>{settings.addressLines.join(", ")}</p>
          ) : null}
        </div>
      )}
      {directions ? (
        <p className="site-map__directions">
          <a
            href={directions}
            rel="noopener noreferrer"
            target="_blank"
            aria-label="Open directions in Google Maps (opens in a new tab)"
            className="site-link"
          >
            Open directions in Google Maps
            <Icon name="arrow" />
          </a>
        </p>
      ) : null}
    </div>
  );
}
