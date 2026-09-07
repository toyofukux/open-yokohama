import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import source from '../data/childcare/source.json';
import fontManifest from '../data/fonts/manifest.json';
import base from '../data/geography/yokohama-wards.json';
import { comparisonBands, parseChildcareWardTable } from '../packages/core/childcare';
import { renderWardMap } from '../packages/core/ward-map';

const check = process.argv.includes('--check');
const hash = (input: string | Buffer) => createHash('sha256').update(input).digest('hex');
const raw = readFileSync('data/childcare/ward-table-2026.txt');
assert.equal(hash(raw), source.extractedTextSha256, 'Extracted source changed');
const data = parseChildcareWardTable(raw.toString());
const number = (value: number) => value.toLocaleString('ja-JP');
const percent = (value: number) => `${value.toFixed(1)}％`;
const ranked = [...data.wards].sort((a, b) => b.rate - a.rate || a.code.localeCompare(b.code));
const svg = renderWardMap(
  base,
  data.wards.map((w) => ({ code: w.code, label: percent(w.rate), band: w.band })),
  '2026年4月・横浜18区の申請者に占める保留児童の割合',
  '育児休業の延長希望を含む全年齢の保留児童。市全体3.4％。割合は瀬谷区6.8％、泉区6.1％、栄区5.2％の順。市全体比0.8倍未満・0.8〜1.2倍未満・1.2倍以上の3色。',
);
const legend = (['low', 'middle', 'high'] as const)
  .map(
    (key) =>
      `<li><span style="background:${comparisonBands[key].color}"></span><strong>${comparisonBands[key].label}</strong><small>${comparisonBands[key].range}</small></li>`,
  )
  .join('');
const table = ranked
  .map(
    (w) =>
      `<tr id="childcare-${w.slug}"><th scope="row">${w.name}</th><td data-label="保留の割合">${percent(w.rate)}</td><td data-label="保留児童">${number(w.held)}人</td><td data-label="申請者">${number(w.applicants)}人</td><td data-label="前年の割合">${percent(w.previousRate)}</td><td data-label="市全体との比較">${comparisonBands[w.band].short}</td></tr>`,
  )
  .join('');
const figure = `<figure class="ward-evidence" id="childcare-ward-map" data-childcare-map>
<figcaption><p class="evidence-kicker">18区を、同じものさしで</p><h3>人数は港北区、割合は瀬谷区が最も多い</h3><p>2026年4月1日｜申請者に占める保留児童の割合</p></figcaption>
<p class="evidence-definition"><strong>この地図は、育児休業の延長希望を含む全年齢の2,532人を比較。</strong>上の年齢別分析の1,256人とは対象が異なる。</p>
<div class="evidence-highlights"><div><span>横浜市全体</span><strong>${percent(data.city.rate)}</strong><small>2,532人 / 73,834人</small></div><div><span>割合が最も高い・瀬谷区</span><strong>${percent(ranked[0].rate)}</strong><small>142人 / 2,086人</small></div><div><span>人数が最も多い・港北区</span><strong>312人</strong><small>割合は3.2％・市全体に近い</small></div></div>
<ul class="map-legend" aria-label="地図の3色の意味">${legend}</ul>
<div class="ward-map-canvas">${svg}</div>
<div class="ward-map-controls" hidden><label for="childcare-ward-select">自分の区の数字を確かめる</label><select id="childcare-ward-select"><option value="">区を選ぶ</option>${data.wards.map((w) => `<option value="${w.code}">${w.name}</option>`).join('')}</select><p role="status" aria-live="polite" data-ward-detail>区を選ぶと、人数・割合・市全体との違いを表示する。</p></div>
<p class="map-reading">瀬谷区・泉区・栄区・旭区は市全体の1.2倍以上。港北区は保留児童が最多でも、申請者の数も多く、割合では市全体に近い。人数と割合では、見える地域差が変わる。</p>
<p class="map-limits">色は横浜市内での相対比較。国の基準や統計的な有意差、園の空き率、入園の難易度・保育の質を示すものではない。区内の地域差や年齢別の不足も、この地図だけでは分からない。</p>
<details class="ward-data-table"><summary>18区の人数・割合と、前年の値を見る</summary><table><caption>保留児童には育児休業の延長希望を含む。各年4月1日時点。2026年は年度限定保育事業の利用児童を利用児童数に算入しており、前年と定義に差がある（原資料1ページ）。</caption><thead><tr><th scope="col">区</th><th scope="col">保留の割合</th><th scope="col">保留児童</th><th scope="col">申請者</th><th scope="col">前年の割合</th><th scope="col">市全体との比較</th></tr></thead><tbody>${table}</tbody></table></details>
<details class="map-method"><summary>色分け・計算・出典を確かめる</summary><p>割合＝保留児童数÷（利用児童数＋保留児童数）×100。申請者数は原資料1ページの定義に従い復元した。市全体は各区の割合の単純平均ではなく、人数の合計から求める。</p><p>低め：市全体の0.8倍未満／近い：0.8倍以上1.2倍未満／高め：1.2倍以上。前後20％の幅は、このサイトが比較のために設定した目安。判定は丸め前の値を使い、表示は小数1桁に丸めた。「近い」は全国的に一般的という意味ではない。</p><p>数値：<a href="${source.url}#page=7">横浜市・2026年度補足説明資料7ページ</a>（定義は1ページ）。境界：<a href="${base.sourceUrl}">国土数値情報・2023年行政区域データ</a>を加工。境界の年と統計の年は異なり、位置確認・測量用の地図ではない。</p></details>
<div class="map-downloads"><a href="/maps/childcare-2026.svg" download>SVG画像を保存</a><a href="/maps/childcare-2026.png" download>PNG画像を保存</a><a href="/maps/childcare-2026.csv" download>数値をCSVで保存</a></div>
</figure>`;

// A standalone export carries the title, definition, legend and attribution with the map.
const legendSvg = (['low', 'middle', 'high'] as const)
  .map(
    (key, i) =>
      `<g transform="translate(${28 + i * 238} 126)"><rect width="20" height="20" fill="${comparisonBands[key].color}"/><text x="28" y="17" font-size="17">${comparisonBands[key].label}</text><text x="28" y="42" font-size="16">${comparisonBands[key].range}</text></g>`,
  )
  .join('');
const exportSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="740" height="1100" viewBox="0 0 740 1100"><title>横浜18区・保留児童の割合（2026年4月1日）</title><rect width="740" height="1100" fill="#fff"/><g fill="#132c3a" font-family="Noto Sans JP,sans-serif"><text x="28" y="42" font-size="27" font-weight="700">申請者に占める保留児童の割合</text><text x="28" y="77" font-size="19">2026年4月1日｜横浜市全体 ${percent(data.city.rate)}</text><text x="28" y="105" font-size="17">育児休業の延長希望を含む・全年齢。空き率や保育の質ではない。</text>${legendSvg}</g><g transform="translate(0 174)">${svg.replace(/<svg[^>]+>/, '').replace('</svg>', '')}</g><g fill="#132c3a" font-family="Noto Sans JP,sans-serif" font-size="15"><text x="28" y="972">割合＝保留児童÷（利用児童＋保留児童）。3色は市全体比の編集上の目安。</text><text x="28" y="1000">数値：横浜市・2026年度補足説明資料7ページ。年齢別・区内の差は未表示。</text><text x="28" y="1028">境界：国土数値情報（行政区域・2023年）（国土交通省）を加工。</text><text x="28" y="1056">Open Yokohama｜open.yokohama/issues/childcare-access/</text></g></svg>`;
// The allowlist was checked against this exact font's cmap. New glyphs require review.
assert.equal(hash(readFileSync(fontManifest.file)), fontManifest.sha256, 'Fixed font changed');
const glyphs = new Set(readFileSync(fontManifest.charactersFile, 'utf8'));
for (const match of exportSvg.matchAll(/>([^<]+)</g)) {
  for (const character of match[1]) {
    assert.ok(/\s/.test(character) || glyphs.has(character), `Unreviewed font glyph: ${character}`);
  }
}
const renderer = new Resvg(exportSvg, {
  font: {
    fontFiles: ['data/fonts/NotoSansJP-map-subset.ttf'],
    loadSystemFonts: false,
    defaultFontFamily: 'Noto Sans JP',
  },
  fitTo: { mode: 'width', value: 1480 },
});
const png = renderer.render().asPng();
const csv =
  '\uFEFF日付,区コード,区,保留児童数,利用児童数,申請者数_利用と保留の和,保留割合_パーセント,前年保留割合_パーセント,市全体との比較\n' +
  data.wards
    .map(
      (w) =>
        `${data.period},${w.code},${w.name},${w.held},${w.enrolled},${w.applicants},${w.rate.toFixed(6)},${w.previousRate.toFixed(6)},${comparisonBands[w.band].short}`,
    )
    .join('\n') +
  '\n';
const outputs: Record<string, string | Buffer> = {
  'data/childcare/derived.json': `${JSON.stringify(data, null, 2)}\n`,
  'data/childcare/figure.html': figure,
  'apps/web/public/maps/childcare-2026.svg': exportSvg,
  'apps/web/public/maps/childcare-2026.png': png,
  'apps/web/public/maps/childcare-2026.csv': csv,
  'apps/web/public/maps/yokohama-wards-base.svg': renderWardMap(
    base,
    base.wards.map((w) => ({ code: w.code, label: '', band: 'middle' })),
    '横浜市18区の白地図',
    base.attribution,
    { middle: '#e5e3d9' },
  ),
};
mkdirSync('apps/web/public/maps', { recursive: true });
for (const [path, content] of Object.entries(outputs)) {
  if (check)
    assert.equal(
      hash(readFileSync(path)),
      hash(content),
      `${path} is stale; run pnpm maps:build and review`,
    );
  else writeFileSync(path, content);
}
console.log(
  `${check ? 'Verified' : 'Generated'} deterministic ward map, PNG, CSV and article figure for18 wards; total${data.city.held}/${data.city.applicants}.`,
);
