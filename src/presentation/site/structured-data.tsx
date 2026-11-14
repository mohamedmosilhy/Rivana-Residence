import { type JsonLd, serializeJsonLd } from "@/application/public";

export function StructuredData({
  id,
  data,
}: Readonly<{ id: string; data: JsonLd }>) {
  return (
    <script
      id={id}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
