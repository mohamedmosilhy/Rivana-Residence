import Image from "next/image";

import type { PublicImage } from "@/application/public/view-models";

type SiteImageProps = Readonly<{
  image: PublicImage;
  /** CSS sizes hint for responsive loading, e.g. "100vw". */
  sizes: string;
  /** Fills a positioned, sized parent (cropped around the focal point). */
  fill?: boolean;
  /** The page's largest image (LCP): preloaded, not lazy. */
  preload?: boolean;
  className?: string;
  /** Decorative uses pass an empty alt deliberately. */
  decorative?: boolean;
  /** "contain" shows the whole photo (the viewer); "cover" crops to fill. */
  fit?: "cover" | "contain";
}>;

export function SiteImage({
  image,
  sizes,
  fill = false,
  preload = false,
  className,
  decorative = false,
  fit = "cover",
}: SiteImageProps) {
  const alt = decorative ? "" : image.alt;
  // The focal point is per-photo data, so it is the one inline value.
  const common = {
    src: image.src,
    sizes,
    className: `${fit === "contain" ? "object-contain" : "object-cover"}${
      className ? ` ${className}` : ""
    }`,
    preload,
    ...(fit === "cover" ? { style: { objectPosition: image.position } } : {}),
  };
  return fill ? (
    <Image {...common} alt={alt} fill />
  ) : (
    <Image {...common} alt={alt} width={image.width} height={image.height} />
  );
}
