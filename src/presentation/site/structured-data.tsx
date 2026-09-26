import type { JsonLd } from "@/application/public/seo";
import { serializeJsonLd } from "@/application/public/seo";

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
