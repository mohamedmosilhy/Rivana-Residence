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

// D-8: reservation-era modules are imported only through their public
// index.ts, never their internals (docs/architecture/dependency-rules.md).
const PUBLIC_SURFACE_MODULES = [
  "branches",
  "audit",
  "health",
  "inventory",
  "pricing",
  "reservations",
  "guests",
  "reporting",
  "notifications",
];
const moduleInternals = ["domain", "application"].flatMap((layer) =>
  PUBLIC_SURFACE_MODULES.map((module) => ({
    group: [`@/${layer}/${module}/*`, `!@/${layer}/${module}/index`],
    message: `Import @/${layer}/${module} through its index.ts (D-8).`,
  })),
);

// D-1a: domain code performs no Node I/O.
const NODE_BUILTINS = [
  "node:*",
  "fs",
  "fs/*",
  "crypto",
  "path",
  "http",
  "https",
  "net",
  "child_process",
  "os",
];

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
            ...moduleInternals,
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
            ...moduleInternals,
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
            {
              group: NODE_BUILTINS,
              message: "Domain code performs no Node I/O (D-1a).",
            },
            ...moduleInternals,
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
            ...moduleInternals,
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/composition/**/*.{ts,tsx}",
      "src/infrastructure/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": ["error", { patterns: [...moduleInternals] }],
    },
  },
  {
    // D-7: HTTP contracts import only zod, so they are safe in client bundles.
    files: ["src/contracts/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/**",
                "../**",
                "next",
                "next/**",
                "react",
                "react/**",
                ...NODE_BUILTINS,
              ],
              message:
                "src/contracts imports only zod and sibling contract files (D-7).",
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
