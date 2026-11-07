// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { auditEvent } from "@/domain/audit";
import {
  RESERVED_BRANCH_SLUGS,
  branchSchema,
  branchSlugSchema,
  isReservedBranchSlug,
} from "@/domain/branches";

const valid = {
  slug: "new-cairo",
  name: "Rivana Residence New Cairo",
};

function issuesFor(input: Record<string, unknown>) {
  const parsed = branchSchema.safeParse({ ...valid, ...input });
  return parsed.success
    ? []
    : parsed.error.issues.map((issue) => issue.path.join("."));
}

// AC-7: a branch slug can never shadow a top-level route or a legacy page.
describe("branch slugs", () => {
  it.each([...RESERVED_BRANCH_SLUGS, "Admin", "API", " book "])(
    "rejects the reserved segment %j",
    (slug) => {
      expect(branchSlugSchema.safeParse(slug).success).toBe(false);
    },
  );

  it.each(["index.html", "rooms.html", "about-us.html"])(
    "rejects the legacy page path %s",
    (slug) => {
      expect(isReservedBranchSlug(slug)).toBe(true);
      expect(branchSlugSchema.safeParse(slug).success).toBe(false);
    },
  );

  it.each(["new-cairo", "giza", "sheikh-zayed-2"])("accepts %s", (slug) => {
    expect(branchSlugSchema.parse(slug)).toBe(slug);
  });

  it.each(["New Cairo", "new--cairo", "-giza", "giza-", "", "a".repeat(81)])(
    "rejects the malformed slug %j",
    (slug) => {
      expect(branchSlugSchema.safeParse(slug).success).toBe(false);
    },
  );

  // AC-16: the domain list and the newest `Branch_slug_check` agree.
  it("names the reserved list the database check uses", () => {
    const migrations = join(__dirname, "../../../prisma/migrations");
    const latest = readdirSync(migrations)
      .filter((name) => /^\d{14}_/.test(name))
      .sort()
      .map((name) =>
        readFileSync(join(migrations, name, "migration.sql"), "utf8"),
      )
      .filter((sql) => sql.includes('ADD CONSTRAINT "Branch_slug_check"'))
      .at(-1)!;
    const list = /"slug" NOT IN \(([^)]*)\)/.exec(latest)![1]!;
    expect([...list.matchAll(/'([^']+)'/g)].map((match) => match[1])).toEqual([
      ...RESERVED_BRANCH_SLUGS,
    ]);
    expect(RESERVED_BRANCH_SLUGS).toEqual(
      expect.arrayContaining(["about", "contact", "rooms", "facilities"]),
    );
  });
});

describe("branch schema", () => {
  it("applies the documented defaults", () => {
    expect(branchSchema.parse(valid)).toMatchObject({
      status: "ACTIVE",
      timeZone: "Africa/Cairo",
      syncReminderIntervalMinutes: 30,
      syncFollowUpMinutes: 10,
      checkInTime: null,
      mapEmbedUrl: null,
    });
  });

  it("accepts HH:MM times and refuses other formats", () => {
    expect(issuesFor({ checkInTime: "14:00", checkOutTime: "09:30" })).toEqual(
      [],
    );
    expect(issuesFor({ checkInTime: "2pm" })).toEqual(["checkInTime"]);
    expect(issuesFor({ checkOutTime: "24:00" })).toEqual(["checkOutTime"]);
  });

  it("keeps the sync follow-up shorter than the interval, within range", () => {
    expect(
      issuesFor({ syncReminderIntervalMinutes: 10, syncFollowUpMinutes: 10 }),
    ).toEqual(["syncFollowUpMinutes"]);
    expect(issuesFor({ syncReminderIntervalMinutes: 9 })).toContain(
      "syncReminderIntervalMinutes",
    );
    expect(issuesFor({ syncFollowUpMinutes: 61 })).toContain(
      "syncFollowUpMinutes",
    );
  });

  it("accepts only Google Maps embed links", () => {
    expect(
      issuesFor({ mapEmbedUrl: "https://www.google.com/maps/embed?pb=x" }),
    ).toEqual([]);
    expect(
      issuesFor({ mapEmbedUrl: "https://evil.example/maps/embed" }),
    ).toEqual(["mapEmbedUrl"]);
  });

  it("refuses an unknown time zone and half a coordinate pair", () => {
    expect(issuesFor({ timeZone: "Mars/Olympus" })).toEqual(["timeZone"]);
    expect(issuesFor({ latitude: 30 })).toEqual(["longitude"]);
  });
});

describe("audit events", () => {
  const base = {
    occurredAt: new Date("2026-11-06T10:00:00Z"),
    action: "staff.branch-assigned" as const,
    entityType: "User" as const,
    entityId: "user-1",
    branchId: "branch-1",
    reason: null,
    changes: { branchId: "branch-1" },
  };

  it("accepts a system event without an actor", () => {
    expect(auditEvent({ ...base, actorType: "SYSTEM", actorId: null })).toEqual(
      {
        ...base,
        actorType: "SYSTEM",
        actorId: null,
      },
    );
  });

  it("requires an actor id for staff and guest events", () => {
    expect(() =>
      auditEvent({ ...base, actorType: "STAFF", actorId: null }),
    ).toThrow("need an actor id");
  });

  it("refuses an over-long reason", () => {
    expect(() =>
      auditEvent({
        ...base,
        actorType: "SYSTEM",
        actorId: null,
        reason: "x".repeat(501),
      }),
    ).toThrow("500 characters");
  });
});
