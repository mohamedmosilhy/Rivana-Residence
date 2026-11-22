// Append-only history of sensitive changes (FR-AUD-1). `changes` carries only
// the keys listed for its action below: never free-form dumps, personal data,
// passwords, or tokens.

export const AUDIT_ACTOR_TYPES = ["STAFF", "GUEST", "SYSTEM"] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

type RoleChange = Readonly<{ role: Readonly<{ from: string; to: string }> }>;
type BranchChange = Readonly<{ branchId: string }>;
type FieldChange = Readonly<{ from: unknown; to: unknown }>;
type AuditMoney = Readonly<{ amountMinor: number; currency: "USD" }>;
type RatePeriodSnapshot = Readonly<{
  startDate: string;
  endDate: string;
  amount: AuditMoney;
  label: string | null;
  active: boolean;
}>;

/** Prices and flags only; the free text description is never copied. */
type ServiceSnapshot = Readonly<{
  maxVehicles?: number | null;
  priceUnit: string;
  price: AuditMoney;
  childPrice: AuditMoney | null;
  active: boolean;
}>;

type CouponSnapshot = Readonly<{
  code: string;
  kind: "PERCENT" | "FIXED";
  percentBasisPoints: number | null;
  amount: AuditMoney | null;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  maxRedemptionsPerPhone: number | null;
  allBranches: boolean;
  branchIds: readonly string[];
  active: boolean;
}>;

/** Each action and the exact shape of its `changes`. */
export type AuditChanges = {
  "staff.role-changed": RoleChange;
  "staff.branch-assigned": BranchChange;
  "staff.branch-unassigned": BranchChange;
  /** A new branch (spec 0002). */
  "branch.created": Readonly<{ slug: string; name: string; status: string }>;
  /** Only the fields that changed, by attribute name. */
  "branch.updated": Readonly<Record<string, FieldChange>>;
  /** A physical unit was added (M6). Notes are never stored in audit. */
  "physical-room.created": Readonly<{
    roomTypeId: string;
    label: string;
    active: boolean;
    notesChanged: boolean;
  }>;
  /** Label and active keep before and after; notes only flag a change. */
  "physical-room.updated": Readonly<{
    label?: Readonly<{ from: string; to: string }>;
    active?: Readonly<{ from: boolean; to: boolean }>;
    notesChanged?: true;
  }>;
  /** A unit block was created (M6-T6). Notes are never stored in audit. */
  "inventory-block.created": Readonly<{
    physicalRoomId: string;
    roomTypeId: string;
    startDate: string;
    endDate: string;
    reason: string;
    noteChanged: boolean;
  }>;
  /** End date keeps before and after; a note edit only flags a change. */
  "inventory-block.updated": Readonly<{
    endDate?: Readonly<{ from: string; to: string }>;
    noteChanged?: true;
  }>;
  /** A block was soft cancelled; the record keeps who and when. */
  "inventory-block.cancelled": Readonly<{
    physicalRoomId: string;
    startDate: string;
    endDate: string;
  }>;
  /** A base rate was created or changed under its row lock. */
  "room-base-rate.updated": Readonly<{
    before: AuditMoney | null;
    after: AuditMoney;
  }>;
  /** A date rate period was created. */
  "rate-period.created": Readonly<{
    before: null;
    after: RatePeriodSnapshot;
  }>;
  /** A date rate period changed, including soft deactivation. */
  "rate-period.updated": Readonly<{
    before: RatePeriodSnapshot;
    after: RatePeriodSnapshot;
  }>;
  /** A branch service offering was created or changed (M7-T4). */
  "service.update": Readonly<{
    kind: string;
    before: ServiceSnapshot | null;
    after: ServiceSnapshot;
    /** The free text itself is never stored; only that it changed. */
    descriptionChanged: boolean;
  }>;
  /** The VAT rate changed under the settings row lock (M7-T4). */
  "coupon.create": Readonly<{
    before: null;
    after: CouponSnapshot;
    descriptionChanged: boolean;
  }>;
  "coupon.update": Readonly<{
    before: CouponSnapshot;
    after: CouponSnapshot;
    descriptionChanged: boolean;
  }>;
  "commercial.update": Readonly<{
    vatRateBasisPoints: Readonly<{ from: number; to: number }>;
  }>;
  /** The hotel's own WhatsApp number and Meta id (M8-T4); never a token. */
  "whatsapp-settings.updated": Readonly<{
    businessPhoneNumber?: Readonly<{ from: string | null; to: string | null }>;
    providerPhoneNumberId?: Readonly<{
      from: string | null;
      to: string | null;
    }>;
  }>;
  "whatsapp-template.created": Readonly<{
    before: null;
    after: WhatsAppTemplateSnapshot;
    previewChanged: boolean;
  }>;
  "whatsapp-template.updated": Readonly<{
    before: WhatsAppTemplateSnapshot;
    after: WhatsAppTemplateSnapshot;
    previewChanged: boolean;
  }>;
  /**
   * A website booking (M8-T7). Identifiers, dates and money only: no guest
   * name, email, phone, token or free text. The actor is the guest profile.
   */
  "reservation.created": Readonly<{
    reference: string;
    source: "WEBSITE";
    status: "CONFIRMED";
    paymentMethod: "PAY_AT_HOTEL";
    checkIn: string;
    checkOut: string;
    units: number;
    totalMinor: number;
    couponCode: string | null;
    marketingOptIn: boolean;
  }>;
  "reservation.staff-created": Readonly<{
    reference: string;
    source: "STAFF" | "EXTERNAL";
    checkIn: string;
    checkOut: string;
    units: number;
    totalMinor: number | null;
    priceOverridden: boolean;
    confirmationRequested: boolean;
  }>;
  /** Totals and unit counts only. An override keeps original, overridden amount and the reason is the event's `reason`. */
  "reservation.stay-modified": Readonly<{
    reference: string;
    changeSeq: number;
    before: ChangeSummaryAudit;
    after: ChangeSummaryAudit;
    oldTotalMinor: number | null;
    newTotalMinor: number | null;
    priceOverridden: boolean;
    overrideFromMinor: number | null;
    overrideToMinor: number | null;
    flagPmsUpdate: boolean;
    guestNotified: boolean;
  }>;
  "reservation.cancelled": Readonly<{
    reference: string;
    reason:
      | "GUEST_REQUEST"
      | "CROSS_SYSTEM_CONFLICT"
      | "INVALID_DETAILS"
      | "OTHER";
    noteProvided: boolean;
    couponReleased: boolean;
    guestNotified: boolean;
    /** Set when the booking was already in the hotel system: the cancellation is a pending change (Q-84). */
    flagPmsUpdate: boolean;
    changeSeq: number | null;
  }>;
  "reservation.pms-update-entered": Readonly<{
    reference: string;
    changeSeq: number;
    pendingSince: string;
  }>;
  "reservation.contact-edited": Readonly<Record<string, true>>;
  "reservation.room-assigned": Readonly<{
    lineId: string;
    fromPhysicalRoomId: string | null;
    toPhysicalRoomId: string | null;
    assigned: boolean;
  }>;
  "reservation.checked-in": FrontDeskAudit;
  "reservation.checked-out": FrontDeskAudit;
  "reservation.no-show": FrontDeskAudit;
  "reservation.pms-entered": Readonly<{ noteProvided: boolean }>;
  "reservation.manage-link-resent": Readonly<{
    emailQueued: boolean;
    whatsappQueued: boolean;
  }>;
  /** The outcome of an Admin test message; the recipient is never stored. */
  "whatsapp-test.sent": Readonly<{
    templateId: string | null;
    purpose: string | null;
    ok: boolean;
    failure: string | null;
  }>;
};

type FrontDeskAudit = Readonly<{
  fromStatus: string;
  toStatus: string;
  fromCheckOut: string;
  toCheckOut: string;
  noteProvided: boolean;
}>;

/** No personal values: dates, unit counts per listing and money only. */
type ChangeSummaryAudit = Readonly<{
  status: string;
  assignedUnits: number;
  checkIn: string;
  checkOut: string;
  units: readonly Readonly<{
    roomTypeId: string;
    adults: number;
    children: number;
  }>[];
  accommodationMinor: number | null;
  services: readonly Readonly<{
    kind: string;
    vehicles: number | null;
    detailsChanged: boolean;
  }>[];
  servicesMinor: number | null;
  discountMinor: number | null;
  vatMinor: number | null;
  totalMinor: number | null;
}>;

/** The staff preview text is not copied; only that it changed. */
type WhatsAppTemplateSnapshot = Readonly<{
  purpose: string;
  language: string;
  providerName: string;
  category: string;
  variables: readonly string[];
  active: boolean;
}>;

export type AuditAction = keyof AuditChanges;

export type AuditEvent<A extends AuditAction = AuditAction> = Readonly<{
  occurredAt: Date;
  actorType: AuditActorType;
  /** Staff user id or guest id; null for SYSTEM (the CLI, scheduled jobs). */
  actorId: string | null;
  action: A;
  entityType:
    | "User"
    | "Branch"
    | "PhysicalRoom"
    | "InventoryBlock"
    | "RoomBaseRate"
    | "RatePeriod"
    | "ServiceOffering"
    | "CommercialSettings"
    | "Coupon"
    | "WhatsAppSettings"
    | "WhatsAppTemplate"
    | "Reservation";
  entityId: string;
  branchId: string | null;
  reason: string | null;
  changes: AuditChanges[A];
}>;

export function auditEvent<A extends AuditAction>(
  event: AuditEvent<A>,
): AuditEvent<A> {
  if (event.actorType !== "SYSTEM" && !event.actorId) {
    throw new Error(`${event.actorType} audit events need an actor id.`);
  }
  if (event.reason !== null && event.reason.length > 500) {
    throw new Error("Audit reasons are limited to 500 characters.");
  }
  return event;
}
