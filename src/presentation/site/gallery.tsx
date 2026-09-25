import type { PublicImage } from "@/application/public/view-models";
import { SiteImage } from "@/presentation/site/site-image";

// A plain, semantic gallery: each photo links to its full-size file, which
// works with a keyboard and without JavaScript. The richer lightbox and
// carousel interactions arrive with the motion work in Phase 9.
//
// EDITORIAL leads with one large photo; GRID keeps every photo equal.
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
  const editorial = layout === "EDITORIAL" && images.length >= 3;
  return (
    <ul
      className={`site-gallery site-gallery--${editorial ? "editorial" : "grid"}`}
      aria-label={label}
    >
      {images.map((image, index) => (
        <li key={image.src}>
          <figure>
            <a href={image.src} className="site-gallery__link">
              <SiteImage
                image={image}
                fill
                sizes={
                  editorial && index === 0
                    ? "(min-width: 64rem) 60vw, 100vw"
                    : "(min-width: 64rem) 30vw, (min-width: 40rem) 50vw, 100vw"
                }
              />
              <span className="sr-only">Open full-size photo</span>
            </a>
          </figure>
        </li>
      ))}
    </ul>
  );
}
