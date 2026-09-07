import { geographies } from '../core/schema.ts';
import { type Change, type Fact, hash } from './model.ts';

export type Calculation = {
  id: string;
  operation: 'difference' | 'ratio' | 'mean';
  inputs: string[];
  value: number;
};
export type Chart = {
  title: string;
  unit: string;
  points: { period: string; value: number; version: string; provisional: boolean }[];
};
export type Section = {
  id: string;
  title: string;
  paragraphs: string[];
  cautions: string[];
  questions: string[];
  charts: Chart[];
  references: string[];
};
export type Article = {
  id: string;
  version: string;
  geography: string;
  title: string;
  method: string;
  sections: Section[];
  calculations: Calculation[];
  inputs: { key: string; version: string }[];
};
const n = (v: number, digits = 0) =>
  new Intl.NumberFormat('ja-JP', { maximumFractionDigits: digits }).format(v);
function lastOf<T>(rows: T[]): T {
  const last = rows.at(-1);
  if (last === undefined) throw new Error('Missing article input');
  return last;
}
const year = (f: Fact) => f.period.slice(0, 4);
export function calculate(operation: Calculation['operation'], facts: Fact[]): Calculation {
  if (!facts.length || (operation !== 'mean' && facts.length !== 2))
    throw new Error('Invalid calculation inputs');
  if (
    facts.some(
      (f) =>
        f.metric !== facts[0].metric ||
        f.dataset !== facts[0].dataset ||
        f.geography !== facts[0].geography,
    ) &&
    operation !== 'ratio'
  )
    throw new Error('Incomparable calculation inputs');
  if (
    operation === 'ratio' &&
    (facts[0].geography !== facts[1].geography ||
      facts[0].period !== facts[1].period ||
      facts[0].dataset !== facts[1].dataset ||
      facts[1].value === 0)
  )
    throw new Error('Incomparable ratio inputs');
  if (
    operation === 'mean' &&
    facts.some(
      (f, i) =>
        f.frequency !== 'year' ||
        (i > 0 && Number(f.period.slice(0, 4)) !== Number(facts[i - 1].period.slice(0, 4)) + 1),
    )
  )
    throw new Error('Mean requires consecutive calendar years');
  const value =
    operation === 'difference'
      ? facts[1].value - facts[0].value
      : operation === 'ratio'
        ? facts[0].value / facts[1].value
        : facts.reduce((s, f) => s + f.value, 0) / facts.length;
  const body = { operation, inputs: facts.map((f) => f.version), value };
  return { id: hash(body), ...body };
}
export function buildArticles(facts: Fact[]): Article[] {
  return geographies.map((geo) => {
    const selected = facts.filter((f) => f.geography === geo.code);
    const pick = (dataset: string, metric: string, from = '') =>
      selected
        .filter((f) => f.dataset === dataset && f.metric === metric && f.period >= from)
        .sort((a, b) => a.period.localeCompare(b.period));
    const sections: Section[] = [];
    const used = new Map<string, Fact>();
    const calculations: Calculation[] = [];
    const use = (rows: Fact[]) => {
      for (const r of rows) used.set(r.key, r);
      return rows;
    };
    const calc = (op: Calculation['operation'], rows: Fact[]) => {
      const c = calculate(op, use(rows));
      calculations.push(c);
      return c.value;
    };
    const chart = (title: string, rows: Fact[], unit = '人'): Chart => ({
      title,
      unit,
      points: use(rows).map((f) => ({
        period: f.period,
        value: f.value,
        version: f.version,
        provisional: f.provisional,
      })),
    });
    const section = (s: Omit<Section, 'references'>, rows: Fact[]) => {
      sections.push({ ...s, references: use(rows).map((f) => f.version) });
    };
    const history = pick('historical', 'population', '1995');
    const households = pick('historical', 'households', '1995');
    if (history.length) {
      const first = history[0],
        last = lastOf(history);
      const peak = history.reduce((a, b) => (a.value >= b.value ? a : b));
      const change = calc('difference', [first, last]);
      const decadal = history.filter((f) => [2000, 2010, 2020].includes(Number(year(f))));
      const paragraphs = [
        `${geo.name}の人口は、${first.period}の${n(first.value)}人から${last.period}の${n(last.value)}人へ、${n(Math.abs(change))}人${change >= 0 ? '増え' : '減り'}ました。直近の一年だけでなく、約${Number(year(last)) - Number(year(first))}年の変化として読みます。`,
        `${decadal.map((f) => `${year(f)}年は${n(f.value)}人`).join('、')}。収録した1995年以降の10月1日の値では、${year(peak)}年の${n(peak.value)}人が最大です。${peak.period === last.period ? '最新の収録年が最大ですが、その後も増え続けるという予測ではありません。' : `${year(peak)}〜${year(last)}年には${n(-calc('difference', [peak, last]))}人減っています。単年の増減と、長く続いた増加の鈍化・転換を分けて確認します。`}`,
      ];
      section(
        {
          id: 'population',
          title: '約30年で見る人口の規模と転換',
          paragraphs,
          cautions: [
            '各年10月1日。国勢調査と、その間の年の推計人口を含みます。基準改定による差を、転出入や政策効果だけに帰属させません。',
            '区の比較は18区が揃う1995年以降に限定します。細かな境界変更まで補正した固定境界人口ではありません。',
          ],
          questions: [
            '人口の増減が異なる地区で、学校・交通・住まいへの需要はどう変わっているでしょうか。施設の利用状況や町丁別の資料を重ねることが、次の確認になります。',
          ],
          charts: [chart('人口の長期推移（各年10月1日）', history)],
        },
        history,
      );
      const hf = households[0],
        hl = lastOf(households);
      const householdChange = calc('difference', [hf, hl]);
      const oldSize = calc('ratio', [first, hf]),
        newSize = calc('ratio', [last, hl]);
      section(
        {
          id: 'households',
          title: '人口と世帯数は、同じ速さで変わっているか',
          paragraphs: [
            `${year(hf)}〜${year(hl)}年に、世帯数は${n(hf.value)}世帯から${n(hl.value)}世帯へ${n(Math.abs(householdChange))}世帯${householdChange >= 0 ? '増え' : '減り'}ました。同じ期間の人口の変化と並べて見ることで、人数だけでは見えない暮らしの単位の変化を考えられます。`,
            `人口を世帯数で割ると、1世帯あたり${n(oldSize, 2)}人から${n(newSize, 2)}人へ変化しています。これは全体を割った平均です。単身世帯や子育て世帯がそれぞれ何世帯あるかは、この計算だけでは分かりません。`,
          ],
          cautions: [
            '人口と世帯は同じ地域・同じ10月1日の値を使います。人数と世帯数は単位が違うため、別のグラフで示します。',
          ],
          questions: [
            '住宅の数・間取り、単身世帯、空き家の実数も合わせると、どのような住まいが必要なのかをより具体的に検討できます。世帯増だけを住宅不足の証拠にはしません。',
          ],
          charts: [chart('世帯数の長期推移', households, '世帯')],
        },
        [...history, ...households],
      );
    }
    const children = pick('ages', 'age_under15'),
      older = pick('ages', 'age_65plus'),
      total = pick('ages', 'age_total'),
      unknown = pick('ages', 'age_unknown');
    if (children.length) {
      const first = children[0],
        last = lastOf(children),
        of = older[0],
        ol = lastOf(older);
      const cf = calc('ratio', [first, total[0]]),
        cl = calc('ratio', [last, lastOf(total)]);
      section(
        {
          id: 'ages',
          title: '約25年で見る世代構成の変化',
          paragraphs: [
            `${year(first)}〜${year(last)}年の各1月1日で見ると、0〜14歳は${n(first.value)}人から${n(last.value)}人へ、65歳以上は${n(of.value)}人から${n(ol.value)}人へ変わっています。総人口の大きさだけで、世代ごとの変化を捉えることはできません。`,
            `0〜14歳の割合は${n(cf * 100, 1)}%から${n(cl * 100, 1)}%です。最新の年齢不詳は${n(lastOf(unknown).value)}人で、割合の分母に含めています。不詳の変化や推計基準による影響もあるため、既知の年齢だけを全人口として扱いません。`,
          ],
          cautions: [
            '年齢は1月1日の推計人口。上の10月1日の人口や、異なる国勢調査基準の最新月の人口を分母に使いません。',
            '同じ人々を追跡したデータではありません。子どもの人数の増減だけで、転居理由や施策の効果を断定しません。',
          ],
          questions: [
            '子どもと高齢者の人数の変化に対し、学校、通院、買い物、移動のしやすさはどう変わったでしょうか。年齢以外の生活条件と、施設の利用実態を確かめる必要があります。',
          ],
          charts: [
            chart('0〜14歳の人数（各年1月1日）', children),
            chart('65歳以上の人数（各年1月1日）', older),
          ],
        },
        [...children, ...older, ...total, ...unknown],
      );
    }
    const natural = pick('dynamics', 'natural_change').filter((f) => f.frequency === 'year'),
      social = pick('dynamics', 'social_change').filter((f) => f.frequency === 'year');
    if (natural.length >= 10) {
      const recent = natural.slice(-5),
        early = natural.slice(0, 5);
      const a = calc('mean', early),
        b = calc('mean', recent);
      const start = natural.findIndex(
        (f, i) => f.value < 0 && natural.slice(i).every((o) => o.value < 0),
      );
      section(
        {
          id: 'flows',
          title: '一年の増減を、長期の出生・死亡・移動と読み合わせる',
          paragraphs: [
            `${year(early[0])}〜${year(lastOf(early))}年の自然増減は年平均${a >= 0 ? '＋' : '−'}${n(Math.abs(a))}人、${year(recent[0])}〜${year(lastOf(recent))}年は年平均${b >= 0 ? '＋' : '−'}${n(Math.abs(b))}人でした。各年の届出を5年ずつまとめ、単年の振れと構造的な変化を分けます。`,
            start >= 0
              ? `${year(natural[start])}〜${year(lastOf(natural))}年は、死亡数が出生数を上回る自然減が続いています。${start === 0 ? 'ただし、開始年より前はこの系列に収録していないため、自然減への転換年とは断定できません。' : ''}社会増減も併せて見る必要があります。市外との転出入差だけでなく、市内移動とその他増減を含む原典の定義を使います。`
              : 'この収録期間の末尾まで自然減が続く区間はありません。自然増減と社会増減を分け、増減の内訳を確認します。',
          ],
          cautions: [
            '動態は暦年1〜12月の届出による増減です。人口残高の年末差・国勢調査の基準改定とは別の系列です。',
            '5年平均は各年の合計を5で割った値です。過去の平均から将来を予測していません。',
          ],
          questions: [
            '転入が増えた理由や住み続けやすさを確かめるには、年代別の移動、転居先、住宅、働く場所などの追加資料が必要です。',
          ],
          charts: [
            chart('自然増減の推移（暦年）', natural),
            chart('社会増減の推移（暦年）', social),
          ],
        },
        [...natural, ...social],
      );
    }
    const monthly = pick(
      geo.code === '141003' ? 'city-series' : 'ward-monthly',
      'population',
      '2000',
    ).filter((f) => f.frequency === 'month');
    if (monthly.length) {
      const last = lastOf(monthly);
      section(
        {
          id: 'monthly',
          title: '直近の動きは、月次と基準改定を区別して確認',
          paragraphs: [
            `${monthly[0].period}〜${last.period}の月次人口を収録しています。最新は${n(last.value)}人です。長期の変化を見たうえで、近年の動きと統計の切替を確認します。`,
          ],
          cautions: [
            '2025年10月に統計基準が切り替わり、それ以降は2025年国勢調査速報値に基づく暫定値です。2025年9月と10月の残高差を、その月の転出超過や実際の人口減少と断定しません。',
            geo.code === '141003'
              ? '市の2025年9月→10月の残高差には統計基準の切替が含まれます。理由の説明には別系列の届出による増減を使います。'
              : '月次の区データは2014年6月からです。それ以前の月を補間して作ってはいません。',
          ],
          questions: [],
          charts: [chart('月次人口（2025年10月に統計基準切替）', monthly)],
        },
        monthly,
      );
    }
    if (geo.code === '141003') {
      const century = pick('historical', 'population');
      if (century.length)
        section(
          {
            id: 'century',
            title: '補足：1920年からの都市の規模',
            paragraphs: [
              `${year(century[0])}年の${n(century[0].value)}人から、${year(lastOf(century))}年の${n(lastOf(century).value)}人まで、原典に掲載された時点を確認できます。市の歴史的な規模を捉える資料として示します。`,
            ],
            cautions: [
              '市域の拡張や区の再編を含む、当時の市域の人口です。現在と同じ境界に換算した100年間の人口ではありません。',
              '初期は主に国勢調査年で、1945年や1991年など収録のない年があります。欠けた年を0や推定値で補っていません。長期比較の主な説明は1995年以降に置きます。',
            ],
            questions: [],
            charts: [chart('当時の市域の人口（原典の掲載時点）', century)],
          },
          century,
        );
    }
    const body = {
      id: `population-history/${geo.slug}`,
      geography: geo.code,
      title: `${geo.name}の人口と暮らしを、長い時間で考える`,
      method:
        '保存原本と照合した数値から決定的に算出。本文・図表・計算は同じ参照版を使用。AI署名済みの既存3記事とは別の検証範囲。',
      sections,
      calculations,
      inputs: [...used.values()].map((f) => ({ key: f.key, version: f.version })),
    };
    return { ...body, version: hash(body) };
  });
}
export function impactedArticles(articles: Article[], changes: Change[]) {
  const changed = new Map(changes.filter((c) => c.kind !== 'added').map((c) => [c.key, c]));
  return articles.flatMap((a) => {
    const inputs = a.inputs.filter((i) => changed.has(i.key));
    return inputs.length
      ? [
          {
            articleId: a.id,
            articleVersion: a.version,
            changes: inputs.flatMap((i) => {
              const c = changed.get(i.key);
              return c ? [c] : [];
            }),
          },
        ]
      : [];
  });
}
