import {
  comparisonInsights,
  ageComparisonInsights,
  historyInsights,
} from "../../../packages/core/chart-insights";
// Shared by static rendering and selector updates: the same data drives both views.
const escape = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const number = (n: number) =>
  new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 }).format(n);
const insightHtml = (paragraphs: string[]) =>
  `<details class="chart-insights"><summary>数字の読み取りを補足する</summary>${paragraphs.map((p) => `<p>${escape(p)}</p>`).join("")}</details>`;
export function bars(
  rows: { label: string; value: number }[],
  title: string,
  signed = true,
  metric = "人口増減",
) {
  const min = Math.min(0, ...rows.map((r) => r.value));
  const max = Math.max(0, ...rows.map((r) => r.value));
  const span = max - min || 1;
  const zero = (-min / span) * 100;
  return `<figure class="data-chart"><figcaption>${escape(title)}</figcaption><p class="note">${signed ? "単位：人。縦線は0人。左は減少、右は増加。同じ尺度で比較しています。" : "単位：人。0を起点に、棒の長さで人数を比較しています。"}</p><div class="bar-axis"><span>${number(min)}</span><span>${number(max)} 人</span></div>${rows.map((r) => `<div class="bar-row"><span>${escape(r.label)}</span><span class="bar-track" aria-hidden="true"><i class="bar-zero" style="left:${zero}%"></i><i class="bar-fill" style="left:${((Math.min(0, r.value) - min) / span) * 100}%;width:${(Math.abs(r.value) / span) * 100}%"></i></span><strong>${signed && r.value > 0 ? "+" : ""}${number(r.value)}</strong></div>`).join("")}${insightHtml(comparisonInsights(rows, metric, signed))}</figure>`;
}
const colors = ["#12678b", "#a34412", "#6f4f98", "#626970"];
const names = ["0〜14歳", "15〜64歳", "65歳以上", "年齢不詳"];
export function stacks(
  rows: { label: string; values: number[]; total: number }[],
  title: string,
) {
  return `<figure class="data-chart"><figcaption>${escape(title)}</figcaption><p class="note">棒の全体が総人口の100%。年齢不詳も含めて比較します。</p><div class="chart-legend">${names.map((n, i) => `<span><i style="background:${colors[i]}"></i>${i + 1} ${n}</span>`).join("")}</div><div class="stack-axis"><span>0%</span><span>50%</span><span>100%</span></div>${rows.map((r) => `<div class="stack-row"><span>${escape(r.label)}</span><div class="stack-track" role="img" aria-label="${escape(r.label)}：${r.values.map((v, i) => `${names[i]} ${number((v / r.total) * 100)}%`).join("、")}">${r.values.map((v, i) => `<span style="width:${(v / r.total) * 100}%;background:${colors[i]}" title="${names[i]} ${number(v)}人（${number((v / r.total) * 100)}%）">${v / r.total >= 0.07 ? i + 1 : ""}</span>`).join("")}</div></div>`).join("")}${insightHtml(ageComparisonInsights(rows))}</figure>`;
}
export function lines(
  periods: string[],
  series: { name: string; values: number[] }[],
  title: string,
  unit: string,
  showNumericReading = true,
  reference?: number,
) {
  const values = series.flatMap((s) => s.values);
  const min = Math.min(0, ...values),
    max = reference
      ? Math.ceil(Math.max(reference, ...values) / (reference / 2)) *
        (reference / 2)
      : Math.max(0, ...values);
  const span = max - min || 1;
  const x = (i: number) => 70 + (i / Math.max(1, periods.length - 1)) * 490;
  const y = (v: number) => 240 - ((v - min) / span) * 200;
  const ticks = reference
    ? Array.from(
        { length: max / (reference / 2) + 1 },
        (_, i) => (i * reference) / 2,
      )
    : Array.from({ length: 5 }, (_, i) => min + (span * i) / 4);
  const labels = [
    ...new Set([0, Math.floor((periods.length - 1) / 2), periods.length - 1]),
  ];
  return `<figure class="data-chart"><figcaption>${escape(title)}</figcaption><div class="chart-legend">${series.map((s, i) => `<span><svg width="30" height="12" aria-hidden="true"><path d="M0 6H30" stroke="${colors[i]}" stroke-width="3" stroke-dasharray="${["none", "8 4", "2 3", "10 3 2 3"][i]}"/></svg>${escape(s.name)}</span>`).join("")}</div><div class="chart-scroll" tabindex="0" role="region" aria-label="推移グラフ。狭い画面では横にスクロールできます"><svg class="line-chart" viewBox="0 0 600 290" role="img" aria-label="${escape(title)}。縦軸は${escape(unit)}、横軸は${periods[0]}から${periods.at(-1)}。元の人数や割合は、下の折りたたみ表で確認できます。"><text x="10" y="20">${escape(unit)}</text>${ticks.map((v) => `<path d="M70 ${y(v)}H560" class="chart-grid"/><text x="60" y="${y(v) + 5}" text-anchor="end">${number(v)}</text>`).join("")}<path d="M70 ${y(0)}H560" class="chart-baseline"/>${series.map((s, j) => `<path fill="none" stroke="${colors[j]}" stroke-width="3" stroke-dasharray="${["none", "8 4", "2 3", "10 3 2 3"][j]}" d="${s.values.map((v, i) => `${i ? "L" : "M"}${x(i)} ${y(v)}`).join(" ")}"/>`).join("")}${labels.map((i) => `<text x="${x(i)}" y="270" text-anchor="middle">${escape(periods[i])}</text>`).join("")}</svg></div><p class="note">線の色と線種で系列を区別しています。元の人数や割合と全期間は、下の折りたたみ表で確認できます。</p>${showNumericReading ? insightHtml(historyInsights(periods, series, unit)) : ""}</figure>`;
}
