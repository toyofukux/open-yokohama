import {
  geographies,
  metrics,
  type MetricId,
  type Snapshot,
} from "../../../../packages/core/schema";
const payload = document.querySelector("#comparison-data");
const metricSelect = document.querySelector<HTMLSelectElement>("#metric");
const periodSelect = document.querySelector<HTMLSelectElement>("#period");
if (!payload?.textContent || !metricSelect || !periodSelect)
  throw new Error("Missing comparison data");
const {
  compact,
  snapshots,
}: { compact: [string, MetricId, string, number][]; snapshots: Snapshot[] } =
  JSON.parse(payload.textContent);
const metricInput = metricSelect;
const periodInput = periodSelect;
function render() {
  const metric = metrics.find((m) => m.id === metricInput.value);
  const period = periodInput.value;
  if (!metric) return;
  const rows = compact
    .filter((o) => o[1] === metric.id && o[2] === period && o[0] !== "141003")
    .sort((a, b) => b[3] - a[3]);
  const max = Math.max(1, ...rows.map((o) => Math.abs(o[3])));
  const body = document.querySelector("#comparison-body");
  if (!body) return;
  body.replaceChildren();
  for (const row of rows) {
    const ward = geographies.find((w) => w.code === row[0]);
    if (!ward) throw new Error("Unknown ward");
    const tr = document.createElement("tr");
    const name = document.createElement("th");
    name.scope = "row";
    const a = document.createElement("a");
    a.href = `/wards/${ward.slug}/`;
    a.textContent = ward.name;
    name.append(a);
    const value = document.createElement("td");
    value.className = "numeric";
    value.textContent = new Intl.NumberFormat("ja-JP", {
      maximumFractionDigits: 2,
    }).format(row[3]);
    const bar = document.createElement("td");
    const track = document.createElement("span");
    track.className = "bar-track";
    track.setAttribute("aria-hidden", "true");
    const fill = document.createElement("span");
    fill.className = "bar-fill";
    fill.style.width = `${(Math.abs(row[3]) / max) * 100}%`;
    track.append(fill);
    bar.append(track);
    const citation = document.createElement("td");
    const link = document.createElement("a");
    link.className = "cite source-icon";
    link.setAttribute("aria-label", "横浜市の掲載ページを開く");
    link.title = "横浜市の掲載ページを開く";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    link.append(icon);
    const snap = snapshots.find((s) =>
      s.url.endsWith(
        `e1yokohama${period.slice(2, 4)}${period.slice(5, 7)}.csv`,
      ),
    );
    if (!snap) throw new Error("Source missing");
    link.href = snap.sourcePage;
    citation.append(link);
    tr.append(name, value, bar, citation);
    body.append(tr);
  }
  const definition = document.querySelector("#definition");
  const heading = document.querySelector("#value-heading");
  const caption = document.querySelector("#comparison-caption");
  if (definition) definition.textContent = metric.definition;
  if (heading) heading.textContent = `${metric.name}（${metric.unit}）`;
  if (caption)
    caption.textContent = `${period}時点の${metric.name}（${metric.unit}）。値の大きい順。`;
  history.replaceState(
    null,
    "",
    `?${new URLSearchParams({ metric: metric.id, period })}`,
  );
}
const params = new URLSearchParams(location.search);
if (metrics.some((m) => m.id === params.get("metric")))
  metricInput.value = params.get("metric") ?? "population";
if ([...periodInput.options].some((o) => o.value === params.get("period")))
  periodInput.value = params.get("period") ?? periodInput.value;
metricInput.addEventListener("change", render);
periodInput.addEventListener("change", render);
if (location.search) render();

metricInput.disabled = false;
periodInput.disabled = false;
