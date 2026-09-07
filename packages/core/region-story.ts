export type Story = {
  title: string;
  paragraphs: string[];
  discussion: string[];
  method: string;
};
export type FlowYear = {
  year: number;
  total: number;
  natural: number;
  social: number;
  population?: number;
};
export type AgeYear = {
  year: number;
  total: number;
  child: number;
  older: number;
  unknown: number;
};
const number = (v: number, digits = 1) =>
  new Intl.NumberFormat('ja-JP', { maximumFractionDigits: digits }).format(v);
const people = (v: number) => {
  const a = Math.abs(v);
  if (a >= 10000) return `約${number(a / 10000)}万人`;
  if (a >= 1000) return `約${number(Math.round(a / 100) * 100, 0)}人`;
  return `${number(a, 0)}人`;
};
const motion = (v: number) => (v > 0 ? '増加' : v < 0 ? '減少' : '増減なし');
const average = (rows: FlowYear[], key: 'total' | 'natural' | 'social') =>
  rows.reduce((sum, r) => sum + r[key], 0) / rows.length;
const windowLabel = (rows: { year: number }[]) =>
  `${rows[0].year}〜${rows[rows.length - 1].year}年`;
const continuous = (rows: { year: number }[]) =>
  rows.every((r, i) => i === 0 || r.year === rows[i - 1].year + 1);
export function flowStory(
  name: string,
  input: FlowYear[],
  wardBalance?: { up: number; down: number; zero: number },
): Story {
  const rows = [...input].sort((a, b) => a.year - b.year);
  if (!rows.length || !continuous(rows))
    throw new Error('Story requires consecutive annual observations');
  const latest = rows[rows.length - 1];
  const recent = rows.slice(-5);
  const before = rows.slice(-10, -5);
  const baseline = rows.filter((r) => r.year >= rows[0].year + 1 && r.year <= rows[0].year + 5);
  const p: string[] = [];
  const scale = latest.population ? (latest.total / latest.population) * 100 : undefined;
  const nearFlat = scale !== undefined && Math.abs(scale) < 0.05;
  const title = nearFlat
    ? `${name}は、増減の境目にある。内訳では大きく動いている。`
    : `${name}の${motion(latest.total)}は、一年の出来事か、続いてきた変化か。`;
  const scaleText =
    scale === undefined || latest.population === undefined
      ? ''
      : `年初の人口${people(latest.population)}に対して${Math.abs(scale) < 0.01 ? '0.01%未満' : `約${number(Math.abs(scale), 2)}%`}の${motion(latest.total)}です。`;
  p.push(
    `${latest.year}年の出生・死亡・移動などの届出を合計すると、人口増減は${motion(latest.total)}でした。${scaleText}${nearFlat ? '規模で見るとほぼ横ばいです。小さな増減の符号だけで、街が大きく変わったとは言えません。' : '同じ千人の増減でも、地域の人口規模によって重みは違います。まず街全体に対する大きさで捉えます。'}`,
  );
  if (recent.length === 5 && baseline.length === 5 && baseline[4].year < recent[0].year) {
    p.push(
      `${windowLabel(baseline)}には年平均${people(average(baseline, 'total'))}の${motion(average(baseline, 'total'))}だったのに対し、${windowLabel(recent)}は年平均${people(average(recent, 'total'))}の${motion(average(recent, 'total'))}です。${Math.sign(average(recent, 'total')) !== Math.sign(latest.total) ? `直近一年の${motion(latest.total)}と、この5年間の流れは同じではありません。` : '一年だけの上下ではなく、数年をまとめると変化の大きさが見えてきます。'}${before.length === 5 ? `一つ前の5年間（${windowLabel(before)}）も年平均${people(average(before, 'total'))}の${motion(average(before, 'total'))}でした。` : ''}`,
    );
  } else if (recent.length === 5) {
    p.push(
      `${windowLabel(recent)}の5年間では、年平均${people(average(recent, 'total'))}の${motion(average(recent, 'total'))}でした。単年の数字はこの数年の動きと並べて読みます。`,
    );
  } else
    p.push(
      `収録範囲は${windowLabel(rows)}です。この時点では5年分がそろわず、長期の流れが変わったとはまだ判断しません。`,
    );
  const negativeStart = rows.findIndex(
    (r, i) => r.natural < 0 && rows.slice(i).every((x) => x.natural < 0),
  );
  const naturalHistory =
    negativeStart > 0 && rows[negativeStart - 1].natural >= 0
      ? `${rows[negativeStart].year}年から${latest.year}年まで、死亡が出生を上回る自然減が続いています。`
      : latest.natural < 0
        ? `${rows[0].year}年以降の収録範囲では、直近は死亡が出生を上回っています。`
        : `${latest.year}年は${latest.natural > 0 ? '出生が死亡を上回り、人口増加に寄与しています' : '出生と死亡が同数でした'}。`;
  const offset =
    latest.natural < 0 && latest.social > 0
      ? `いまは移動などによる社会増${people(latest.social)}が、自然減${people(latest.natural)}を${latest.total > 0 ? '上回っています' : latest.total < 0 ? '補い切れていません' : 'ちょうど相殺しています'}。${nearFlat ? '合計がほとんど動かなくても、中では反対方向への大きな動きが起きています。' : ''}自然減がある間は、同じ人口を維持するにも、それに見合う社会増が必要になります。`
      : `直近の自然増減と社会増減は${Math.sign(latest.natural) === Math.sign(latest.social) ? '同じ方向に働いています' : '反対方向に働いています'}。合計だけでなく、出生・死亡と人の移動を分けると、何が増減を形作っているかを確かめられます。`;
  const earlier =
    baseline.length === 5 &&
    baseline[4].year < latest.year &&
    average(baseline, 'natural') > 0 &&
    average(baseline, 'social') > 0 &&
    latest.natural < 0
      ? '以前は出生と移動の両方が人口を押し上げていましたが、いまは出生・死亡による増減が人口を減らす側に回っています。'
      : '';
  p.push(earlier + naturalHistory + offset);
  if (wardBalance)
    p.push(
      `${latest.year}年には、市内でも${wardBalance.up}区が増加し、${wardBalance.down}区が減少${wardBalance.zero ? `、${wardBalance.zero}区は増減なし` : ''}でした。横浜全体の方向を、そのまま自分の近所に当てはめることはできません。駅周辺と住宅地、同じ区の中の地区まで分けて初めて、どこで暮らしが変わっているかを考えられます。`,
    );
  return {
    title,
    paragraphs: p,
    discussion: [
      'ここからの問いは「人口を増やせばよいか」だけではありません。誰が入ってきて、誰が出ていくのか。進学・就職の時期と、子育てや住み替えの時期では、住まいや交通に求めるものは同じでしょうか。年代別・移動先別のデータと家賃、通勤時間を合わせれば、選ばれる地域なのか、住み続けにくい地域なのかを検討する材料になります。転居の理由は別途調査が必要です。',
      '増える地区の学校・保育・交通の受け皿と、減る地区で買い物や通院の手段をどう保つかは、同時に議論できます。施設を増やすのか、既存施設の使い方や移動手段を変えるのか。その判断には、町丁別の人口、利用人数、空き状況、到達時間、維持費が必要です。人口の増減だけを、地域や政策の成績表にはしません。',
    ],
    method:
      '本文の概数は丸めて表示し、増減方向は元の数値で判定します。年別の届出数を使用。5年平均は連続した暦年の合計÷5。人口規模との比較は同じ年の1月1日の推計人口を分母にした目安で、公式の人口動態率ではありません。「ほぼ横ばい」は絶対値0.05%未満を表す編集上の表現です。将来予測はしていません。',
  };
}
export function ageStory(name: string, input: AgeYear[]): Story {
  const rows = [...input].sort((a, b) => a.year - b.year);
  if (!rows.length || !continuous(rows)) throw new Error('Story requires consecutive annual ages');
  const first = rows[0],
    last = rows[rows.length - 1];
  const ratio = (key: 'total' | 'child' | 'older') => last[key] / first[key];
  const childPeak = rows.reduce((a, b) => (b.child > a.child ? b : a));
  const totalChange = ratio('total') - 1,
    childChange = ratio('child') - 1,
    olderChange = ratio('older') - 1;
  const ratioText = (value: number) =>
    Math.abs(value - 1) < 0.05
      ? value === 1
        ? '同じ人数'
        : `ほぼ同じ規模（約${number(Math.abs(value - 1) * 100)}%${value > 1 ? '増' : '減'}）`
      : `約${number(value)}倍`;
  const title =
    childChange < 0 && olderChange > 0
      ? `${name}では、住民の数以上に、世代の構成が変わっている。`
      : `${name}の暮らしを、総人口だけで捉えない。`;
  const paragraphs = [
    `${first.year}年から${last.year}年にかけて、総人口は${ratioText(ratio('total'))}、65歳以上は${ratioText(ratio('older'))}、0〜14歳は${ratioText(ratio('child'))}になりました。${Math.sign(totalChange) !== Math.sign(childChange) ? '街全体の人口と子どもの人数は、同じ方向に動いていません。' : '総人口の変化の中でも、世代ごとの増減の大きさは違います。'}「住民が何人いるか」に加えて、「どの世代が暮らす街になったか」を見る意味があります。`,
    childPeak.year < last.year && last.child < childPeak.child
      ? `子どもの人数が収録期間で最も多かったのは${childPeak.year}年です。そこから${last.year}年までは約${number((1 - last.child / childPeak.child) * 100)}%減っており、一時点の割合だけでは見えない、期間を通じた人数の変化です。ただし、少ない子どもが広い範囲に住んでいれば、学校や遊び場までの距離という別の課題もあります。市や区の総数が減ったことだけで、施設の余裕や統廃合の妥当性は判断できません。`
      : `子どもの人数は収録期間の終わりに${last.child === childPeak.child ? '最も多い水準にあります' : '変化しています'}。総人口とは別に、学校に入る年齢の人数、住む地区、保育や放課後の利用希望を確かめると、受け皿をどこに用意するかという議論につながります。`,
  ];
  const ten = rows.find((r) => r.year === last.year - 10),
    five = rows.find((r) => r.year === last.year - 5);
  if (ten && five) {
    const prev = five.older - ten.older,
      recent = last.older - five.older;
    paragraphs.push(
      `65歳以上の人数の変化は、${ten.year}〜${five.year}年の${people(prev)}の${motion(prev)}から、${five.year}〜${last.year}年の${people(recent)}の${motion(recent)}へ変わっています。同じ${last.older > first.older ? '高齢人口の増加' : '高齢人口の変化'}でも、時期によって進み方は違います。ただし、直近5年では年齢不詳も${people(last.unknown - five.unknown)}${last.unknown >= five.unknown ? '増えて' : '減って'}います。見かけの変化には分類や推計の見直しも含まれるため、これだけで高齢化が落ち着いたとは言えません。`,
    );
  }
  return {
    title,
    paragraphs,
    discussion: [
      '年齢構成が変わるとき、街の使われ方も変わっていないかを確かめたいところです。買い物や通院へ歩いて行けるか、車を使わない人にも交通手段があるか、災害時に避難できるか。75歳以上の人数、一人暮らし、坂道や停留所までの距離を重ねることで、年齢だけでは見えない暮らしの条件を議論できます。65歳以上を一律に「支援が必要な人」とは捉えません。',
      '子育て支援と高齢者支援を、単に人数比で予算を奪い合う話にする必要はありません。同じ公共施設を時間帯で使い分けられるか、移動支援が子どもにも高齢者にも役立つか。利用実態、費用、担い手、住民の希望を確かめれば、どの世代も暮らし続けられる地域にするための選択肢を比較できます。ここで挙げた不足や効果が、この人口データで確認できたという意味ではありません。',
    ],
    method:
      '各年1月1日の推計人口。同じ人々を追跡したデータではありません。倍率・割合・人数差は丸める前の数値から算出。子どもの最大値は収録期間内のみ。年齢不詳を他の年齢層へ割り振っていません。',
  };
}
