import assert from 'node:assert/strict';

export interface ChildcareChartData {
  history: {
    sourceId: string;
    sourceSha256: string;
    sourceUrl: string;
    years: number[];
    children: number[];
    applications: number[];
  };
  ages: {
    sourceId: string;
    sourceSha256: string;
    sourceUrl: string;
    observedOn: string;
    excludingExtensionDesired: boolean;
    values: number[];
    total: number;
  };
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
const format = (n: number) => n.toLocaleString('ja-JP');
const cell = (label: string, value: string) => `<td data-label="${label}">${value}</td>`;
const table = (caption: string, headers: string[], rows: string) =>
  `<details class="childcare-chart-data"><summary>データ表で見る</summary><table><caption>${caption}</caption><thead><tr>${headers.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></details>`;
const ticks = (max: number, step: number, label: (n: number) => string) =>
  Array.from({ length: max / step + 1 }, (_, i) => {
    const value = i * step;
    return `<div class="childcare-tick" style="bottom:${(value / max) * 100}%"><span>${label(value)}</span></div>`;
  }).join('');
const bar = (value: number, max: number, name: string, color: string) =>
  `<div class="childcare-column"><div class="childcare-bar ${color}" data-value="${value}" style="height:${((value / max) * 100).toFixed(6)}%"><span class="childcare-value">${format(value)}</span></div><span class="childcare-bar-label">${name}</span></div>`;

export function renderChildcareCharts(data: ChildcareChartData) {
  const { history, ages } = data;
  for (const source of [history, ages]) {
    assert.match(source.sourceSha256, /^[a-f0-9]{64}$/);
    assert.ok(source.sourceUrl.startsWith('https://www.city.yokohama.lg.jp/'));
  }
  assert.deepEqual(history.years, [2004, 2012]);
  assert.equal(history.children.length, 2);
  assert.equal(history.applications.length, 2);
  for (const value of [...history.children, ...history.applications]) {
    assert.ok(Number.isSafeInteger(value) && value > 0 && value <= 250000);
  }
  assert.equal(ages.observedOn, '2026-04-01');
  assert.equal(ages.excludingExtensionDesired, true, 'Do not mix age and ward populations');
  assert.equal(ages.values.length, 6);
  for (const value of ages.values)
    assert.ok(Number.isSafeInteger(value) && value >= 0 && value <= 800);
  assert.ok(ages.total > 0 && ages.values.reduce((sum, value) => sum + value, 0) === ages.total);

  const change = (values: number[]) => {
    const delta = values[1] - values[0];
    return `${(Math.abs(delta / values[0]) * 100).toFixed(1)}％${delta < 0 ? '減' : '増'}`;
  };
  const historyGroups = history.years
    .map(
      (year, i) =>
        `<div class="childcare-year-group"><div class="childcare-bars">${bar(history.children[i], 250000, '子ども', 'childcare-blue')}${bar(history.applications[i], 250000, '申込み', 'childcare-orange')}</div><span class="childcare-year">${year}年</span></div>`,
    )
    .join('');
  const historyRows = [
    ['就学前児童数', history.children] as const,
    ['保育所入所申込数', history.applications] as const,
  ]
    .map(
      ([name, values]) =>
        `<tr><th scope="row">${name}</th>${cell('2004年', format(values[0]))}${cell('2012年', format(values[1]))}${cell('人数差', `${values[1] - values[0] >= 0 ? '+' : '−'}${format(Math.abs(values[1] - values[0]))}`)}${cell('増減率', change([...values]))}</tr>`,
    )
    .join('');
  const historyDescription = history.years
    .map(
      (year, i) =>
        `${year}年は就学前児童${format(history.children[i])}人、保育所入所申込${format(history.applications[i])}人`,
    )
    .join('。');
  const historyHtml = `<figure class="editorial-figure childcare-chart" id="childcare-history" aria-labelledby="childcare-history-title">
<h3 id="childcare-history-title">子ども数と保育所への申込数</h3>
<ul class="childcare-legend"><li><span class="childcare-swatch childcare-blue" aria-hidden="true"></span>就学前児童数（子ども）</li><li><span class="childcare-swatch childcare-orange" aria-hidden="true"></span>保育所入所申込数（申込み）</li></ul>
<div class="childcare-chart-area" role="img" aria-label="${historyDescription}。横浜市・各4月1日。共通の0〜25万人の目盛り。"><div aria-hidden="true"><div class="childcare-unit">人数（人）</div><div class="childcare-plot">${ticks(250000, 50000, (n) => (n === 0 ? '0' : `${n / 10000}万`))}<div class="childcare-groups">${historyGroups}</div></div></div></div>
<div class="childcare-chart-bottom"><p class="childcare-takeaway"><strong><span>子どもは${change(history.children)}、</span><span>申込みは${change(history.applications)}。</span></strong></p>
<p class="childcare-chart-note">横浜市・各年4月1日。2時点の比較であり、途中の動きや増減の原因は示さない。申込数は、保育を必要とする全家庭の数ではない。</p>
${table('人数の単位は人。増減率は各指標の2004年比。', ['指標', '2004年', '2012年', '人数差', '増減率'], historyRows)}
</div><figcaption><a href="${escapeHtml(history.sourceUrl)}">横浜市『調査季報172号』11ページ・表1</a>を基に当サイト作成。</figcaption></figure>\n`;

  const highlighted = ages.values[1] + ages.values[2];
  const ratio = Math.round((highlighted / ages.total) * 100);
  const ageDescription = ages.values.map((value, i) => `${i}歳児${format(value)}人`).join('、');
  const ageRows = ages.values
    .map(
      (value, i) =>
        `<tr><th scope="row">${i}歳児</th>${cell('保留児童数', format(value))}${cell('構成比', `${((value / ages.total) * 100).toFixed(1)}％`)}</tr>`,
    )
    .join('');
  const agesHtml = `<figure class="editorial-figure childcare-chart childcare-age-chart" id="childcare-ages" aria-labelledby="childcare-ages-title">
<h3 id="childcare-ages-title">保留児童の約${ratio}％は1・2歳児</h3>
<p class="childcare-chart-note">2026年4月1日・横浜市。育児休業の延長希望を除く${format(ages.total)}人の内訳。</p>
<div class="childcare-chart-area" role="img" aria-label="育児休業の延長希望を除く保留児童。${ageDescription}。合計${format(ages.total)}人、1・2歳児は${format(highlighted)}人で約${ratio}％。"><div aria-hidden="true"><div class="childcare-unit">人数（人）</div><div class="childcare-plot">${ticks(800, 200, String)}<div class="childcare-age-bars">${ages.values.map((v, i) => bar(v, 800, `${i}歳`, i === 1 || i === 2 ? 'childcare-blue' : 'childcare-neutral')).join('')}</div></div></div></div>
<div class="childcare-chart-bottom"><p class="childcare-chart-note">クラス年齢で集計。割合は保留児童の中での構成比で、年齢ごとの入園の難しさを示す率ではない。次の区別地図は育休延長希望を含むため、対象が異なる。</p>
${table('育休延長希望を除く保留児童。人数の単位は人。構成比は丸めのため合計が100％と一致しない場合がある。', ['クラス年齢', '保留児童数', '構成比'], ageRows)}
</div><figcaption><a href="${escapeHtml(ages.sourceUrl)}">横浜市・2026年補足説明資料2ページ</a>を基に当サイト作成。(${format(ages.values[1])}＋${format(ages.values[2])})÷${format(ages.total)}＝約${ratio}％。</figcaption></figure>\n`;
  return { 'childcare-history': historyHtml, 'childcare-ages': agesHtml };
}
