import { defineConfig } from "astro/config";
import { checkRelease } from "../../scripts/factcheck.ts";
import { ensureEvidenceCache } from "../../scripts/factcheck-cache.ts";
await ensureEvidenceCache();
await checkRelease();
const {check} = await import("../../scripts/warehouse.ts");
await check();
// Direct Astro builds must enforce the same numeric gates as the package build command.
await import('../../scripts/validate.ts');
await import('../../scripts/validate-dynamics.ts');
await import('../../scripts/validate-ages.ts');
export default defineConfig({
  output: "static",
  site: process.env.SITE_URL || "https://open.yokohama",
  trailingSlash: "always",
});
