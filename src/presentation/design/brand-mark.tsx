import Image from "next/image";

import logoOnDark from "../../../design/assets/images/rivana-logo.png";
import logoOnLight from "../../../design/assets/images/rivana-logo-sticky.png";

type BrandMarkProps = Readonly<{
  /** For plum surfaces (the admin sidebar and menu sheet). */
  inverse?: boolean;
  /** Empty when a neighbouring label already names the brand. */
  alt?: string;
}>;

/** The approved Rivana logo, used across the admin screens. */
export function BrandMark({
  inverse = false,
  alt = "Rivana Residence",
}: BrandMarkProps) {
  return (
    <Image
      src={inverse ? logoOnDark : logoOnLight}
      alt={alt}
      width={500}
      height={300}
      unoptimized
      className="brand-mark"
    />
  );
}
