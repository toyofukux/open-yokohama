import { stacks, lines } from "../chart-html";
import { storyHtml } from "../region-story-html";
import type { Story } from "../../../../packages/core/region-story";
export {};
type Record = {
  geography: string;
  period: string;
  values: { age_total: number; [key: string]: number };
};
const payload = document.querySelector("#age-data");
const period = document.querySelector<HTMLSelectElement>("#age-period");
const geography = document.querySelector<HTMLSelectElement>("#age-geography");
if (!payload?.textContent || !period || !geography)
  throw new Error("Missing age data");
const data: {
  records: Record[];
  stories: { [code: string]: Story };
  geographies: { code: string; name: string; slug: string }[];
  columns: string[];
} = JSON.parse(payload.textContent);
const periodInput = period,
  geoInput = geography;
const number = (value: number) => new Intl.NumberFormat("ja-JP").format(value);
function fill(body: Element, records: Record[], history = false) {
  body.replaceChildren();
  for (const r of records) {
    const tr = document.createElement("tr"),
      label = document.createElement("th");
    label.scope = "row";
    if (history) label.textContent = r.period;
    else {
      const g = data.geographies.find((g) => g.code === r.geography)!;
      const a = document.createElement("a");
      a.textContent = g.name;
      a.href = g.code === "141003" ? "/" : `/wards/${g.slug}/`;
      label.append(a);
    }
    tr.append(label);
    for (const metric of ["age_total", ...data.columns]) {
      const td = document.createElement("td");
      td.className = "numeric";
      td.textContent =
        metric === "age_total"
          ? number(r.values[metric])
          : `${number(r.values[metric])}（${((r.values[metric] / r.values.age_total) * 100).toFixed(1)}%）`;
      tr.append(td);
    }
    body.append(tr);
  }
}
function render() {
  document.querySelector("#age-story")!.innerHTML = storyHtml(
    data.stories[geoInput.value],
    "ages",
  );
  fill(
    document.querySelector("#age-body")!,
    data.records.filter((r) => r.period === periodInput.value),
  );
  fill(
    document.querySelector("#age-history")!,
    data.records
      .filter((r) => r.geography === geoInput.value)
      .sort((a, b) => b.period.localeCompare(a.period)),
    true,
  );
  document.querySelector("#age-caption")!.textContent =
    `${periodInput.value}現在の人数（人）と総人口に対する割合（%）。市・区の掲載順。`;
  const name = data.geographies.find((g) => g.code === geoInput.value)!.name;
  document.querySelector("#age-chart")!.innerHTML = stacks(
    data.records
      .filter((r) => r.period === periodInput.value)
      .map((r) => ({
        label: data.geographies.find((g) => g.code === r.geography)!.name,
        values: data.columns.map((m) => r.values[m]),
        total: r.values.age_total,
      })),
    `${periodInput.value}現在の年齢構成（%）`,
  );
  const chronological = data.records
    .filter((r) => r.geography === geoInput.value)
    .sort((a, b) => a.period.localeCompare(b.period));
  document.querySelector("#age-index-chart")!.innerHTML = lines(
    chronological.map((r) => r.period.slice(0, 4)),
    [
      ["age_total", "総人口"],
      ["age_under15", "0〜14歳"],
      ["age_65plus", "65歳以上"],
    ].map(([key, name]) => ({
      name,
      values: chronological.map(
        (r) => (r.values[key] / chronological[0].values[key]) * 100,
      ),
    })),
    `${name}の人数の変化（最初の年＝100）`,
    `${chronological[0].period.slice(0, 4)}年＝100`,
    false,
    100,
  );
  document.querySelector("#age-history-chart")!.innerHTML = lines(
    chronological.map((r) => r.period.slice(0, 4)),
    data.columns.map((m, i) => ({
      name: ["0〜14歳", "15〜64歳", "65歳以上", "年齢不詳"][i],
      values: chronological.map(
        (r) => (r.values[m] / r.values.age_total) * 100,
      ),
    })),
    `${name}の年齢構成の推移（各年1月1日）`,
    "%",
  );
  document.querySelector("#age-history-caption")!.textContent =
    `${name}の各年1月1日現在の人数（人）と総人口に対する割合（%）。`;
  document.querySelector("#age-status")!.textContent =
    `${periodInput.value}現在の市区比較と、${name}の年別推移を表示しています。`;
  const params = new URLSearchParams(location.search);
  params.set("period", periodInput.value);
  params.set("geography", geoInput.value);
  history.replaceState(null, "", `?${params}`);
}
const params = new URLSearchParams(location.search);
if ([...period.options].some((o) => o.value === params.get("period")))
  period.value = params.get("period")!;
if ([...geography.options].some((o) => o.value === params.get("geography")))
  geography.value = params.get("geography")!;
period.addEventListener("change", render);
geography.addEventListener("change", render);
if (params.has("period") || params.has("geography")) render();
period.disabled = false;
geography.disabled = false;
