// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import type { ProblemCode } from "@/app/api/v1/_http/problem";
import { sendAnalyticsEvents } from "@/presentation/api-client";
import type { ApiProblemCode } from "@/presentation/api-client";

import { CALLS } from "./calls";
import { answer, resetBrowser, stubFetch } from "./support";

// covers: M10-T1. The client is typed only, so these tests catch drift from the
// published contract and keep server code out of the browser.

afterEach(resetBrowser);

const root = join(__dirname, "../../..");
type Operation = {
  responses: Record<string, unknown>;
  parameters?: { in: string; name: string }[];
};
const document = JSON.parse(
  readFileSync(join(root, "docs/api/openapi.json"), "utf8"),
) as { paths: Record<string, Record<string, Operation>> };

describe.each(CALLS)("$name against openapi.json", (call) => {
  const operation = document.paths[call.template]?.[call.method.toLowerCase()];

  it("calls a published operation that matches its URL", () => {
    expect(operation).toBeDefined();
    const pattern = new RegExp(
      `^${call.template.replace(/\{[^}]+\}/g, "[^/]+")}$`,
    );
    expect(call.url.split("?")[0]).toMatch(pattern);
  });

  it("accepts exactly the documented success statuses", async () => {
    const documented = Object.keys(operation!.responses)
      .filter((status) => status.startsWith("2"))
      .map(Number)
      .sort();
    expect([...call.statuses].sort()).toEqual(documented);
    for (const status of documented) {
      stubFetch(() => answer(status, {}));
      expect(await call.run()).toMatchObject({ ok: true, status });
    }
  });

  it("sends every documented header", async () => {
    const wire = stubFetch(() => answer(call.statuses[0]!, {}));
    await call.run();
    for (const parameter of operation!.parameters ?? [])
      if (parameter.in === "header")
        expect(wire.sent().headers).toHaveProperty([parameter.name]);
  });
});

it("sends events to the published P11 operation", () => {
  const wire = stubFetch(() => answer(204, null));
  sendAnalyticsEvents([{ name: "PAGE_VIEW", path: "/" }]);
  expect(document.paths[wire.sent().url]?.post).toBeDefined();
});

it("lists the server's codes and only its own three besides", () => {
  expectTypeOf<Exclude<ProblemCode, ApiProblemCode>>().toEqualTypeOf<never>();
  expectTypeOf<Exclude<ApiProblemCode, ProblemCode>>().toEqualTypeOf<
    "NETWORK" | "UNEXPECTED_RESPONSE" | "ABORTED"
  >();
});

describe("browser safety", () => {
  const sources = ["api-client", "format"].flatMap((folder) => {
    const directory = join(root, "src/presentation", folder);
    return readdirSync(directory).map((name) => ({
      name: `${folder}/${name}`,
      text: readFileSync(join(directory, name), "utf8"),
    }));
  });

  it.each(sources)("$name imports other folders as types only", ({ text }) => {
    const offenders = [...text.matchAll(/^(?:import|export)\b[^;]*;/gm)]
      .map((match) => match[0])
      .filter((statement) => /from\s+["'](?!\.\/)/.test(statement))
      .filter((statement) => !/^(?:import|export) type\b/.test(statement));
    expect(offenders).toEqual([]);
    expect(text).not.toMatch(/\bimport\(/);
  });

  it.each(sources)("$name writes nothing to the console", ({ text }) => {
    expect(text).not.toMatch(/\bconsole\./);
  });
});
