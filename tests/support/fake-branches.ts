import type {
  BranchRecord,
  BranchRepository,
  BranchRow,
} from "@/application/branches";
import { success } from "@/application/shared/result";

// An in-memory BranchRepository for unit tests (spec 0002). Reads come from
// the given rows; writes are recorded and succeed.

export function branchRow(overrides: Partial<BranchRow> = {}): BranchRow {
  return {
    id: "branch-1",
    slug: "new-cairo",
    name: "Rivana Residence",
    status: "ACTIVE",
    sortOrder: 0,
    summary: null,
    onlineBookingEnabled: false,
    timeZone: "Africa/Cairo",
    phone: null,
    email: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    country: null,
    latitude: null,
    longitude: null,
    mapEmbedUrl: null,
    checkInTime: null,
    checkOutTime: null,
    heroMediaId: null,
    syncReminderIntervalMinutes: 30,
    syncFollowUpMinutes: 10,
    updatedAt: new Date("2026-11-07T10:00:00Z"),
    ...overrides,
  };
}

const record = ({
  id,
  slug,
  name,
  status,
  sortOrder,
}: BranchRow): BranchRecord => ({
  id,
  slug,
  name,
  status,
  sortOrder,
});

export function fakeBranches(rows: readonly BranchRow[] = [branchRow()]) {
  const writes: { kind: string; args: unknown[] }[] = [];
  const sorted = () => [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
  const repository: BranchRepository = {
    findDefaultActive: async () => {
      const found = sorted().find((row) => row.status === "ACTIVE");
      return found ? record(found) : null;
    },
    findDefault: async () => {
      const found = sorted()[0];
      return found ? record(found) : null;
    },
    findById: async (id) => {
      const found = rows.find((row) => row.id === id);
      return found ? record(found) : null;
    },
    findBySlug: async (slug) => {
      const found = rows.find((row) => row.slug === slug);
      return found ? record(found) : null;
    },
    listAll: async () => sorted().map(record),
    listActiveRows: async () =>
      sorted().filter((row) => row.status === "ACTIVE"),
    listRows: async () => sorted(),
    findRowById: async (id) => rows.find((row) => row.id === id) ?? null,
    findActiveRowBySlug: async (slug) =>
      rows.find((row) => row.slug === slug && row.status === "ACTIVE") ?? null,
    catalogFlags: async (ids) =>
      ids.map((branchId) => ({
        branchId,
        stayTypes: [],
        hasFacilities: false,
      })),
    publishedSlugs: async () => ({
      rooms: ["deluxe-double"],
      facilities: ["swimming-pool"],
    }),
    create: async (input, pages, audit) => {
      writes.push({ kind: "create", args: [input, pages, audit("new-id")] });
      return success(
        branchRow({ ...input, id: "new-id" } as Partial<BranchRow>),
      );
    },
    update: async (id, patch, actorId, audit) => {
      writes.push({ kind: "update", args: [id, patch, actorId, audit] });
      const current = rows.find((row) => row.id === id)!;
      return success({ ...current, ...(patch as Partial<BranchRow>) });
    },
  };
  return { repository, writes };
}
