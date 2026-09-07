import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import schoolLunchMarkdown from "../../scripts/school-lunch-markdown.mjs";
import policyTableLabels from "../../scripts/policy-table-labels.mjs";
import policyEvidence from "../../scripts/policy-evidence.mjs";
import { checkArchive } from "../../scripts/factcheck-archive.ts";
await checkArchive();
await import("../../scripts/validate-editorial.ts");
// Direct Astro builds must enforce the same numeric gates as the package build command.
await import('../../scripts/validate.ts');
await import('../../scripts/validate-dynamics.ts');
await import('../../scripts/validate-ages.ts');
const {check} = await import("../../scripts/warehouse.ts");
await check();
export default defineConfig({
  output: "static",
  site: process.env.SITE_URL || "https://open.yokohama",
  trailingSlash: "always",
  markdown: { processor: unified({ remarkPlugins: [schoolLunchMarkdown, policyTableLabels, policyEvidence], smartypants: false }) },
});
