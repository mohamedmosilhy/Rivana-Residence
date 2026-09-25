import type { PublicImage } from "@/application/public/view-models";
import { SiteImage } from "@/presentation/site/site-image";

// A plain, semantic gallery: each photo links to its full-size file, which
// works with a keyboard and without JavaScript. The richer lightbox and
// carousel interactions arrive with the motion work in Phase 9.
export function Gallery({
  images,
  label,
  layout = "GRID",
}: Readonly<{
  images: readonly PublicImage[];
  label: string;
  layout?: string;
}>) {
  if (images.length === 0) return null;
  return (
    <ul
      className={`site-gallery site-gallery--${layout.toLowerCase()}`}
      aria-label={label}
    >
      {images.map((image) => (
        <li key={image.src}>
          <figure>
            <a href={image.src} className="site-gallery__link">
              <SiteImage
                image={image}
                fill
                sizes="(min-width: 64rem) 33vw, (min-width: 40rem) 50vw, 100vw"
              />
              <span className="sr-only">Open full-size photo</span>
            </a>
          </figure>
        </li>
      ))}
    </ul>
  );
}
