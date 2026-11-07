// Writes docs/api/openapi.json from the Zod contracts (ADR 014).
// Run `npm run openapi` after changing anything in src/contracts/api/v1; the
// OpenAPI freshness unit test fails while the committed file is stale.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { serializeOpenApiDocument } from "../src/contracts/api/v1/openapi.ts";

const target = fileURLToPath(
  new URL("../docs/api/openapi.json", import.meta.url),
);
await writeFile(target, serializeOpenApiDocument());
console.log(`Wrote ${target}`);
