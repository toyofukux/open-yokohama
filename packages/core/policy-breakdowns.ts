import assert from 'node:assert/strict';

interface Breakdown {
  sourceId: string;
  sourceSha256: string;
  sourceUrl: string;
  title: string;
  unit: string;
  total: number;
  parts: { label: string; value: number }[];
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function renderPolicyBreakdowns(data: Record<string, Breakdown>) {
  assert.deepEqual(Object.keys(data).sort(), ['cost-funding', 'plastic-process']);
  return Object.fromEntries(
    Object.entries(data).map(([id, d]) => {
      assert.match(d.sourceSha256, /^[a-f0-9]{64}$/);
      assert.ok(d.sourceUrl.startsWith('https://www.city.yokohama.lg.jp/'));
      assert.ok(Number.isSafeInteger(d.total) && d.total > 0);
      assert.equal(d.parts.length, id === 'cost-funding' ? 3 : 2);
      assert.equal(new Set(d.parts.map((p) => p.label)).size, d.parts.length);
      assert.equal(
        d.parts.reduce((sum, p) => sum + p.value, 0),
        d.total,
      );
      assert.equal(d.unit, id === 'cost-funding' ? '千円' : 'トン');
      for (const part of d.parts) assert.ok(Number.isSafeInteger(part.value) && part.value >= 0);
      const amount = (value: number) => {
        if (d.unit === 'トン') return `${value.toLocaleString('ja-JP')}トン`;
        const oku = Math.floor(value / 100000);
        const man = (value % 100000) / 10;
        return `${oku ? `${oku}億` : ''}${man ? `${man.toLocaleString('ja-JP')}万円` : oku ? '円' : '0円'}`;
      };
      const ratio = (value: number) => ((value / d.total) * 100).toFixed(1);
      const description = d.parts
        .map((p) => `${p.label}${amount(p.value)}（${ratio(p.value)}％）`)
        .join('、');
      const legend = d.parts
        .map(
          (p, i) =>
            `<li><span class="breakdown-swatch breakdown-color-${i}" aria-hidden="true"></span><div><strong>${escapeHtml(p.label)}</strong><span>${escapeHtml(amount(p.value))}（${ratio(p.value)}％）</span></div></li>`,
        )
        .join('');
      const segments = d.parts
        .map(
          (p, i) =>
            `<span class="breakdown-segment breakdown-color-${i}" data-value="${p.value}" style="width:${((p.value / d.total) * 100).toFixed(9)}%"></span>`,
        )
        .join('');
      const rows = d.parts
        .map(
          (p) =>
            `<tr><th scope="row">${escapeHtml(p.label)}</th><td data-label="${escapeHtml(d.unit)}">${p.value.toLocaleString('ja-JP')}</td><td data-label="構成比">${ratio(p.value)}％</td></tr>`,
        )
        .join('');
      const plastic = id === 'plastic-process';
      const before = plastic
        ? '<ol class="visual-steps visual-steps-compact"><li><strong>分けて集める</strong><span>家庭で分別し、市が回収。</span></li><li><strong>異物を取り除く</strong><span>選別・圧縮・梱包してリサイクル施設へ。</span></li></ol>'
        : '';
      const note = plastic
        ? '市が公表した2区分の内訳。資源化した重量であり、同じ量の温室効果ガスを削減したという意味ではない。'
        : '市債は将来返す借入金。一般財源の0.3％だけが市の負担ではない。';
      const caption = plastic
        ? '横浜市の2025年度資源化量を基に当サイト作成。材料として利用する方法と、化学原料等へ変える方法がある。工程図は本文の市広報を基に整理し、工程ごとの同じ物量を測った図ではない。'
        : '横浜市・事業計画書の本文21ページを基に当サイト作成。単位千円を換算。単年度の設置事業で、前倒しの追加費用や運転・保守費を含む総費用ではない。';
      return [
        id,
        `<figure class="editorial-figure policy-visual" id="${id}" aria-labelledby="${id}-title">
<h3 id="${id}-title">${escapeHtml(d.title)}</h3>
${before}
<p class="breakdown-total">合計 <strong>${escapeHtml(amount(d.total))}</strong></p>
<div role="img" aria-label="${escapeHtml(`${d.title}。合計${amount(d.total)}。${description}。合計を100％とした内訳。`)}"><div class="breakdown-bar" aria-hidden="true">${segments}</div><div class="breakdown-scale" aria-hidden="true"><span>0％</span><span>全体 100％</span></div></div>
<ul class="breakdown-legend">${legend}</ul>
<p class="visual-note">${note}</p>
<details class="visual-data"><summary>データ表で見る</summary><table><caption>${escapeHtml(d.title)}。構成比は合計${escapeHtml(amount(d.total))}を分母に計算し、小数1桁に丸めた。</caption><thead><tr><th scope="col">区分</th><th scope="col">${escapeHtml(d.unit)}</th><th scope="col">構成比</th></tr></thead><tbody>${rows}<tr><th scope="row">合計</th><td data-label="${escapeHtml(d.unit)}">${d.total.toLocaleString('ja-JP')}</td><td data-label="構成比">100.0％</td></tr></tbody></table></details>
<figcaption><a href="${escapeHtml(d.sourceUrl)}">原資料を見る</a>。${caption}</figcaption></figure>\n`,
      ];
    }),
  );
}
