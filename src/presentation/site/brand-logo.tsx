import Image from "next/image";

import logoOnDark from "../../../design/assets/images/rivana-logo.png";
import logoOnLight from "../../../design/assets/images/rivana-logo-sticky.png";

// The approved Rivana lockup. Both files are small PNGs served as-is:
// image optimization is reserved for library media under /media.
export function BrandLogo({
  tone,
  className,
  alt = "",
}: Readonly<{
  /** "inverse" for plum/photo backgrounds, "default" for light surfaces. */
  tone: "inverse" | "default";
  className?: string;
  /** Empty when a neighbouring label already names the brand. */
  alt?: string;
}>) {
  return (
    <Image
      src={tone === "inverse" ? logoOnDark : logoOnLight}
      alt={alt}
      unoptimized
      className={className}
    />
  );
}
