import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const restrictedInfrastructureImports = {
  group: ["@/infrastructure/**", "**/infrastructure/**"],
  message:
    "Presentation must call application ports instead of infrastructure directly.",
};

const restrictedCompositionImports = {
  group: ["@/composition/**", "**/composition/**"],
  message:
    "Only route modules and Server Actions in src/app may use the composition root.",
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
    files: ["src/presentation/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            restrictedInfrastructureImports,
            restrictedCompositionImports,
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
                "@/composition/**",
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
              group: [
                "@/composition/**",
                "@/infrastructure/**",
                "@/presentation/**",
                "next/**",
              ],
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
