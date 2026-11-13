import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

// Next.js refuses to start when two dynamic segments at the same level use
// different names (`[id]` beside `[branchId]`). `next build` does not catch it;
// the dev server and production server fail at start. Keep one name per level.

const root = join(__dirname, "../../..");
const appRoot = join(root, "src/app");

function conflicts(directory: string): string[] {
  const entries = readdirSync(directory).filter((entry) =>
    statSync(join(directory, entry)).isDirectory(),
  );
  const dynamic = entries.filter(
    (entry) => /^\[[^\]]+\]$/.test(entry) && !entry.startsWith("[..."),
  );
  const own =
    dynamic.length > 1
      ? [`${relative(root, directory)}: ${dynamic.join(" vs ")}`]
      : [];
  return [
    ...own,
    ...entries.flatMap((entry) => conflicts(join(directory, entry))),
  ];
}

describe("route segment names", () => {
  it("uses one dynamic segment name per path level", () => {
    expect(conflicts(appRoot)).toEqual([]);
  });
});
