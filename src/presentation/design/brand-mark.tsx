import Image from "next/image";

import logoOnDark from "../../../design/assets/images/rivana-logo.png";
import logoOnLight from "../../../design/assets/images/rivana-logo-sticky.png";

const SIZES = {
  default: "block h-14 w-auto",
  topbar: "block h-10 w-auto",
  login: "block h-16 w-auto",
} as const;

type BrandMarkProps = Readonly<{
  /** For plum surfaces (the admin sidebar and menu sheet). */
  inverse?: boolean;
  /** Empty when a neighbouring label already names the brand. */
  alt?: string;
  size?: keyof typeof SIZES;
  /** Above-the-fold marks should load immediately. */
  eager?: boolean;
}>;

/** The approved Rivana logo, used across the admin screens. */
export function BrandMark({
  inverse = false,
  alt = "Rivana Residence",
  size = "default",
  eager = false,
}: BrandMarkProps) {
  return (
    <Image
      src={inverse ? logoOnDark : logoOnLight}
      alt={alt}
      width={500}
      height={300}
      unoptimized
      loading={eager ? "eager" : "lazy"}
      className={SIZES[size]}
    />
  );
}
