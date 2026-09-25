import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

describe("import boundaries", () => {
  it("rejects a presentation client importing server infrastructure", async () => {
    const eslint = new ESLint();
    const [result] = await eslint.lintText(
      '"use client";\nimport { serverRuntime } from "@/infrastructure/server/runtime";\nvoid serverRuntime;',
      { filePath: "src/presentation/invalid-boundary.client.tsx" },
    );

    expect(result?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-restricted-imports",
        }),
      ]),
    );
  });
});
