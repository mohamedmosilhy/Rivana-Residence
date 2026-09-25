type BrandMarkProps = Readonly<{
  inverse?: boolean;
}>;

export function BrandMark({ inverse = false }: BrandMarkProps) {
  return (
    <span className="brand-mark" aria-label="Rivana Residence">
      <span className="brand-mark__primary">Rivana</span>
      <span className="brand-mark__secondary" style={inverse ? { color: "inherit" } : undefined}>
        Residence
      </span>
    </span>
  );
}
