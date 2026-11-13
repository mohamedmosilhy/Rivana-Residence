import type { CommercialSettingsRecord } from "@/application/commercial";
import type {
  ServiceCatalogEntry,
  ServiceOfferingRecord,
} from "@/application/services";
import type {
  CommercialSettings,
  ServiceOfferingDto,
} from "@/contracts/api/v1/commercial";
import type { z } from "zod";

import { money } from "./pricing";

export function serviceOffering(
  kind: ServiceOfferingDto["kind"],
  record: ServiceOfferingRecord | null,
): ServiceOfferingDto {
  if (!record) {
    return {
      kind,
      priceUnit: null,
      price: null,
      childPrice: null,
      active: false,
      description: null,
      updatedAt: null,
    };
  }
  return {
    kind,
    priceUnit: record.priceUnit,
    price: money(record.price),
    childPrice: record.childPrice ? money(record.childPrice) : null,
    active: record.active,
    description: record.description,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export const serviceList = (entries: readonly ServiceCatalogEntry[]) => ({
  items: entries.map((entry) => serviceOffering(entry.kind, entry.offering)),
});

export const commercialSettings = (
  record: CommercialSettingsRecord,
): z.infer<typeof CommercialSettings> => ({
  vatRateBasisPoints: record.vatRateBasisPoints,
  updatedAt: record.updatedAt.toISOString(),
});
