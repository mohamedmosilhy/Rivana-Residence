import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const restrictedInfrastructureImports = {
  group: ["@/infrastructure/**", "**/infrastructure/**"],
  message:
    "Presentation must call application ports instead of infrastructure directly.",
};

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    files: ["src/app/**/*.{ts,tsx}", "src/presentation/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            restrictedInfrastructureImports,
            {
              group: ["@/lib/env/server", "**/lib/env/server"],
              message:
                "Server environment values cannot enter presentation modules.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/application/**",
                "@/infrastructure/**",
                "@/presentation/**",
                "next/**",
                "react",
              ],
              message:
                "Domain code must remain framework and adapter independent.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/application/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/infrastructure/**", "@/presentation/**", "next/**"],
              message:
                "Application code may depend only on domain contracts and ports.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "coverage/**",
    "design/**",
    "docs/**",
    "node_modules/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);
