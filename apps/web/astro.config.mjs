import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import schoolLunchMarkdown from "../../scripts/school-lunch-markdown.mjs";
import policyTableLabels from "../../scripts/policy-table-labels.mjs";
export default defineConfig({
  output: "static",
  site: process.env.SITE_URL || "https://open.yokohama",
  trailingSlash: "always",
  markdown: { processor: unified({ remarkPlugins: [schoolLunchMarkdown, policyTableLabels], smartypants: false }) },
});
