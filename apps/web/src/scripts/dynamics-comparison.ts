import { bars } from "../chart-html";
import { storyHtml } from "../region-story-html";
import type { Story } from "../../../../packages/core/region-story";
export {};
const payload = document.querySelector("#movement-data");
const metric = document.querySelector<HTMLSelectElement>("#movement-metric");
const year = document.querySelector<HTMLSelectElement>("#movement-year");
if (!payload?.textContent || !metric || !year)
  throw new Error("Missing dynamics comparison");
const data: {
  stories: Record<string, Story>;
  compact: [string, string, string, number][];
  wards: { code: string; slug: string; name: string }[];
  metrics: { id: string; name: string; definition: string }[];
  sourcePage: string;
} = JSON.parse(payload.textContent);
const metricInput = metric,
  yearInput = year;
function render() {
  document.querySelector("#movement-story")!.innerHTML = storyHtml(
    data.stories[yearInput.value],
    "movement",
  );
  const definition = data.metrics.find((m) => m.id === metricInput.value)!;
  const rows = data.compact
    .filter((o) => o[0] === yearInput.value && o[2] === definition.id)
    .sort((a, b) => b[3] - a[3]);
  document.querySelector("#movement-chart")!.innerHTML = bars(
    rows.map((r) => ({
      label: data.wards.find((w) => w.code === r[1])!.name,
      value: r[3],
    })),
    `${yearInput.value}年の${definition.name}（人）`,
    definition.id.endsWith("change"),
    definition.name,
  );
  const body = document.querySelector("#movement-body")!;
  body.replaceChildren();
  for (const row of rows) {
    const ward = data.wards.find((w) => w.code === row[1])!;
    const tr = document.createElement("tr"),
      th = document.createElement("th"),
      name = document.createElement("a"),
      value = document.createElement("td"),
      source = document.createElement("td"),
      link = document.createElement("a"),
      icon = document.createElement("span");
    th.scope = "row";
    name.href = `/population-movement/${ward.slug}/`;
    name.textContent = ward.name;
    th.append(name);
    value.className = "numeric";
    value.textContent = new Intl.NumberFormat("ja-JP").format(row[3]);
    link.href = data.sourcePage;
    link.className = "cite source-icon";
    link.setAttribute("aria-label", "横浜市の掲載ページを開く");
    link.title = "横浜市の掲載ページを開く";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    icon.setAttribute("aria-hidden", "true");
    link.append(icon);
    source.append(link);
    tr.append(th, value, source);
    body.append(tr);
  }
  document.querySelector("#movement-definition")!.textContent =
    definition.definition;
  document.querySelector("#movement-heading")!.textContent =
    `${definition.name}（人）`;
  document.querySelector("#movement-caption")!.textContent =
    `${yearInput.value}年1月〜12月の${definition.name}（人）。値の大きい順。`;
  document.querySelector("#movement-status")!.textContent =
    `${yearInput.value}年・${definition.name}を表示しています。`;
  const params = new URLSearchParams(location.search);
  params.set("metric", definition.id);
  params.set("year", yearInput.value);
  history.replaceState(null, "", `?${params}`);
}
const params = new URLSearchParams(location.search);
if (data.metrics.some((m) => m.id === params.get("metric")))
  metric.value = params.get("metric")!;
if ([...year.options].some((o) => o.value === params.get("year")))
  year.value = params.get("year")!;
metric.addEventListener("change", render);
year.addEventListener("change", render);
if (params.has("metric") || params.has("year")) render();
metric.disabled = false;
year.disabled = false;
