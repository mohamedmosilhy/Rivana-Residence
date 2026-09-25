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

describe("composition root boundary", () => {
  it("rejects presentation modules importing the composition root", async () => {
    const eslint = new ESLint();
    const [result] = await eslint.lintText(
      'import { getCurrentStaff } from "@/composition/auth";\nvoid getCurrentStaff;',
      { filePath: "src/presentation/admin/invalid-composition.tsx" },
    );

    expect(result?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "no-restricted-imports" }),
      ]),
    );
  });

  it("rejects application modules importing the composition root", async () => {
    const eslint = new ESLint();
    const [result] = await eslint.lintText(
      'import { getCurrentStaff } from "@/composition/auth";\nvoid getCurrentStaff;',
      { filePath: "src/application/auth/invalid-composition.ts" },
    );

    expect(result?.messages.map((message) => message.ruleId)).toContain(
      "no-restricted-imports",
    );
  });
});
