const n = (value: number) =>
  new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 }).format(value);
const signed = (value: number) => `${value > 0 ? '+' : ''}${n(value)}`;
const periodLabel = (period: string) =>
  /^\d{4}$/.test(period) ? `${period}年` : period.replace(/^(\d{4})-(\d{2})$/, '$1年$2月');
type Row = { label: string; value: number };
export function comparisonInsights(rows: Row[], metric: string, isChange: boolean): string[] {
  if (!rows.length) return [];
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const high = sorted[0].value,
    low = sorted[sorted.length - 1].value;
  const labels = (v: number) =>
    sorted
      .filter((r) => r.value === v)
      .map((r) => r.label)
      .join('・');
  const lead =
    high === low
      ? `表示中の${rows.length}区は、すべて${n(high)}人で同じ値です。`
      : `${metric}が最も大きいのは${labels(high)}（${isChange ? signed(high) : n(high)}人）、最も小さいのは${labels(low)}（${isChange ? signed(low) : n(low)}人）です。`;
  if (!isChange)
    return [
      lead,
      'これは人数の比較です。人口規模が異なるため、この順位だけで起こりやすさや地域の良し悪しは比べられません。',
    ];
  const positive = rows.filter((r) => r.value > 0).length;
  const negative = rows.filter((r) => r.value < 0).length;
  const zero = rows.length - positive - negative;
  const meaning =
    metric === '自然増減'
      ? 'プラスの区では出生が死亡を上回り、マイナスの区では死亡が出生を上回っています。'
      : metric === '社会増減'
        ? '転入から転出を引き、その他増減を加えた結果です。出生・死亡による増減は含みません。'
        : metric === '人口増減'
          ? 'プラスは期間中の増加、マイナスは減少です。出生・死亡と移動などを合わせた結果で、増減の理由は各区の内訳で確かめられます。'
          : 'その他増減には職権による記載・消除などが含まれます。転入や出生の人数そのものではありません。';
  return [
    lead,
    `${rows.length}区のうち、プラスは${positive}区、マイナスは${negative}区、0人は${zero}区です。${meaning}`,
    '人数の大小だけでは、住みやすさや政策の効果は判断できません。',
  ];
}
export function ageComparisonInsights(
  rows: { label: string; values: number[]; total: number }[],
): string[] {
  const city = rows.find((r) => r.label === '横浜市');
  const wards = rows.filter((r) => r.label !== '横浜市');
  const out: string[] = [];
  if (city)
    out.push(
      `横浜市全体では、0〜14歳は${n((city.values[0] / city.total) * 100)}%、65歳以上は${n((city.values[2] / city.total) * 100)}%です。総人口を100人に置き換えると、0〜14歳は約${Math.round((city.values[0] / city.total) * 100)}人、65歳以上は約${Math.round((city.values[2] / city.total) * 100)}人にあたります。`,
    );
  for (const [index, name] of [
    [0, '0〜14歳'],
    [2, '65歳以上'],
  ] as const) {
    if (!wards.length) continue;
    const max = Math.max(...wards.map((r) => r.values[index] / r.total));
    const highest = wards.filter((r) => r.values[index] / r.total === max);
    out.push(
      `${name}の割合が最も高いのは${highest.map((r) => r.label).join('・')}（${n(max * 100)}%）です。`,
    );
  }
  out.push(
    `割合が高い区が、人数も最も多いとは限りません。${city ? `市全体の年齢不詳は${n((city.values[3] / city.total) * 100)}%です。` : ''}不詳も分母に含むため、その違いも比較に影響します。順位は表示を丸める前の割合で比べています。`,
  );
  return out;
}
export function historyInsights(
  periods: string[],
  series: { name: string; values: number[] }[],
  unit: string,
): string[] {
  if (!periods.length || !series.length) return [];
  const out: string[] = [];
  if (unit === '人' && series.length === 3) {
    const [total, natural, social] = series.map((s) => s.values[s.values.length - 1]);
    out.push(
      `${periodLabel(periods[periods.length - 1])}の人口増減は${signed(total)}人です。自然増減${signed(natural)}人と、社会増減${signed(social)}人を合わせた結果です。`,
    );
    if (natural < 0 && social > 0)
      out.push(
        total > 0
          ? '出生より死亡が多い一方、移動などによる増加がその減少を上回り、合計では増加しています。'
          : total < 0
            ? '移動などによる増加はありますが、出生より死亡が多いことによる減少を補い切れず、合計では減少しています。'
            : '出生より死亡が多いことによる減少と、移動などによる増加が、ちょうど相殺しています。',
      );
  }
  for (const s of series.filter((s) =>
    unit === '%' ? !s.name.includes('15〜64') && !s.name.includes('不詳') : s === series[0],
  )) {
    const first = s.values[0],
      last = s.values[s.values.length - 1];
    const delta = last - first;
    const difference = Math.abs(delta) < 0.05 && delta !== 0 ? '0.1未満' : n(Math.abs(delta));
    out.push(
      `${s.name}${unit === '%' ? 'の割合' : ''}は${periodLabel(periods[0])}の${n(first)}${unit}から${periodLabel(periods[periods.length - 1])}の${n(last)}${unit}へ、${delta === 0 ? '変わっていません' : `${difference}${unit === '%' ? 'ポイント' : '人'}${delta > 0 ? '上がっています' : '下がっています'}`}。`,
    );
  }
  out.push(
    unit === '%'
      ? '最初と最後の時点を比べた変化です。割合と差は丸める前の値からそれぞれ計算しています。途中も一貫して変化したという意味ではありません。年齢不詳や推計の見直しの影響もあり、このグラフだけでは原因を特定できません。'
      : '比べているのは各期間の増減人数です。増減人数が下がっても、プラスなら人口は増えています。この差は期間全体の人口減少数ではありません。毎年・毎月同じ方向に動いたという意味でもありません。月別では季節差もあるため、端の2か月だけで長期の傾向は判断できません。',
  );
  return out;
}
