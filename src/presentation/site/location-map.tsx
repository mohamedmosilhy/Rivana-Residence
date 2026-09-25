import type { PublicSettings } from "@/application/public/view-models";

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
      ) : null}
      {directions ? (
        <p>
          <a
            href={directions}
            rel="noopener noreferrer"
            target="_blank"
            aria-label="Open directions in Google Maps (opens in a new tab)"
          >
            Open directions in Google Maps
          </a>
        </p>
      ) : null}
    </div>
  );
}
