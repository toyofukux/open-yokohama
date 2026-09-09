import { heldPage, records } from './corrections';
/** Editorial pages have no population metric; keep them out of statistical routes. */
export const schoolLunch = {
  slug: 'school-lunch',
  url: '/issues/school-lunch/',
  category: '子育て・教育',
  title: '横浜は、中学校の給食費も無償化すべきか',
  summary:
    '子育て費用をめぐる議論から、給食費の支援対象と国・市の負担、ほかの支援への配分を考える。',
};

export const mayoralIssues = [
  {
    title: '待機児童ゼロの横浜で、保育の何を改善するか',
    summary:
      '保育を増やしてきた経緯から、今の年齢・地域の不足へ。18区地図で人数と割合を確かめ、受入枠と担い手への配分を考える。',
    category: '子育て・保育',
    slug: 'childcare-access',
    sourceIds: ['N1', 'N3', 'N4', 'N5'],
    url: '/issues/childcare-access/',
  },
  {
    title: '横浜の予算を、何に優先して使うか',
    summary:
      '人口と施設、物価が財政に与える変化から、今のサービスと将来の負担をどう分けるか考える。',
    category: '財政・優先順位',
    slug: 'city-budget',
    sourceIds: ['F1', 'F2'],
    url: '/issues/city-budget/',
  },
  {
    title: '市政への信頼を、どう立て直すか',
    summary:
      '調査に至った経緯と認定の範囲から、相談・調査・公表がトップの地位に左右されず働く条件を考える。',
    category: '市政・説明責任',
    slug: 'city-governance',
    sourceIds: ['G1', 'G2'],
    url: '/issues/city-governance/',
  },
  {
    title: 'GREEN×EXPOに、これからどこまで市費をかけるか',
    summary:
      '返還された土地の活用と博覧会の目的から、今後の支出、会期後の公園、ほかの支援への配分を考える。',
    category: '大型事業・まちづくり',
    slug: 'green-expo',
    sourceIds: ['X1', 'X2', 'X3', 'F2'],
    url: '/issues/green-expo/',
  },
  {
    title: '移動の支援は、運賃と路線のどちらを厚くするか',
    summary:
      '社会参加を支える敬老パスと、担い手不足に向き合う地域交通。運賃・乗り場・便のどこで困るかから支援の配分を考える。',
    category: '交通・高齢期の暮らし',
    slug: 'local-mobility',
    sourceIds: ['M1', 'M2', 'M3', 'M4'],
    url: '/issues/local-mobility/',
  },
  {
    title: '学校体育館の空調を、いつ、どこまで整えるか',
    summary:
      '猛暑を受けて進む体育館空調の前倒し。設置まで待つ学校、49.157億円の財源、避難時の使い方を考える。',
    category: '防災・学校施設',
    slug: 'school-shelters',
    sourceIds: ['D1', 'D3', 'D4', 'D5', 'D6', 'F2'],
    url: '/issues/school-shelters/',
  },
];
export const foundationIssues = [
  {
    title: '市長に何を求められ、市長だけでは何を決められないか',
    summary:
      '給食費、学校、バスを例に、市長・市会・教育委員会・国・事業者の役割と、実施までの条件をたどる。',
    category: '市政の仕組み',
    slug: 'mayor-powers',
    url: '/issues/mayor-powers/',
  },
];
export const expansionIssues = [
  {
    title: '医療・介護が必要になっても、地域で暮らし続けられるか',
    summary:
      '高齢化に伴う需要と支える人の不足から、在宅・施設・家族の負担をどう組み合わせるか考える。',
    category: '医療・介護',
    slug: 'care-in-community',
    url: '/issues/care-in-community/',
    sourceIds: ['C1', 'C2', 'C3'],
  },
  {
    title: '投票先を考えるとき、何を優先するか',
    summary: '身近な困りごとを政策の問いに変え、緊急性・届く相手・負担・実行条件を整理する。',
    category: '判断の基礎',
    slug: 'choosing-priorities',
    url: '/issues/choosing-priorities/',
    sourceIds: ['N1', 'D3', 'M2', 'Q03-S1'],
  },
  {
    title: '過去のまちづくりの判断は、今の選択をどう制約するか',
    summary:
      '六大事業とみなとみらいの経緯から、残った都市の機能、維持費、これから変えられる範囲を読む。',
    category: 'まちづくりの歴史',
    slug: 'city-building-history',
    url: '/issues/city-building-history/',
    sourceIds: ['L1', 'L2', 'P1'],
  },
  {
    title: '考えが完全に一致する候補者がいないとき、どう比べるか',
    summary: '譲れない点、調整できる点、情報が足りない点を分け、政策と実行条件を同じ基準で読む。',
    category: '判断の基礎',
    slug: 'comparing-imperfect-choices',
    url: '/issues/comparing-imperfect-choices/',
    sourceIds: ['Q03-S1', 'M1', 'M2'],
  },
  {
    title: '豪雨・地震に備え、何を先に整えるか',
    summary:
      '危険の種類と場所、工事までの時間から、被害を減らす整備と避難・生活の支援を組み合わせる。',
    category: '防災・地域の安全',
    slug: 'disaster-priorities',
    url: '/issues/disaster-priorities/',
    sourceIds: ['B1', 'B2'],
  },
  {
    title: '住居費の負担を減らすため、市は何を支えるべきか',
    summary:
      '家賃を払えること、貸してもらえること、住み続けられること。三つの困りごとから住宅支援を考える。',
    category: '住宅・暮らし',
    slug: 'housing-access',
    url: '/issues/housing-access/',
    sourceIds: ['H1', 'H2', 'H3'],
  },
  {
    title: '横浜市長選は、いつ、どこで、どう投票できるか',
    summary:
      '2026年10月18日の市長選について、当日・期日前・不在者投票と、記入や意思表示を助ける支援を確かめる。',
    category: '投票の基礎',
    slug: 'how-to-vote',
    url: '/issues/how-to-vote/',
    sourceIds: ['V1', 'V2'],
  },
  {
    title: '他都市の制度を横浜に取り入れると、何が変わるか',
    summary:
      '川崎と横浜の高齢者の乗車支援を例に、似た名称の裏にある対象・使い方・費用の条件を比べる。',
    category: '他都市との比較',
    slug: 'learning-from-cities',
    url: '/issues/learning-from-cities/',
    sourceIds: ['K1', 'M1', 'M2'],
  },
  {
    title: '選挙の約束を、予算・実施・結果までどう追うか',
    summary: '学校体育館の空調を例に、約束を確かめられる項目へ分け、計画と実績の間を追う。',
    category: '政策の点検',
    slug: 'policy-follow-through',
    url: '/issues/policy-follow-through/',
    sourceIds: ['D1', 'D3', 'Q03-S1'],
  },
  {
    title: '子どもや高齢者の数が変わると、学校・公共施設をどう残すか',
    summary:
      '一斉に古くなる建物と変わる利用者。施設の数だけでなく、近さ・機能・更新費をそろえて考える。',
    category: '人口・公共施設',
    slug: 'population-facilities',
    url: '/issues/population-facilities/',
    sourceIds: ['P1', 'P2', 'P3'],
  },
  {
    title: '公共空間・緑・再開発を、誰のためにどう使うか',
    summary:
      '公園の賑わいと無料で過ごせる場所、緑の保全と管理費。大通り公園の計画を例に条件を比べる。',
    category: '公園・まちづくり',
    slug: 'public-space',
    url: '/issues/public-space/',
    sourceIds: ['U1', 'U2', 'U3', 'U4'],
  },
  {
    title: '公約の金額は、何を含む数字か',
    summary: '学校体育館の空調を例に、総額・市の負担・追加費用と、毎年かかる費用を分けて読む。',
    category: '判断の基礎',
    slug: 'reading-policy-costs',
    url: '/issues/reading-policy-costs/',
    sourceIds: ['D3', 'F1', 'F2'],
  },
  {
    title: '政策の「実績」は、暮らしの改善を表しているか',
    summary: '待機児童、空調整備、プラスチックの資源化を例に、目標・実施量・結果・効果を分ける。',
    category: '判断の基礎',
    slug: 'reading-policy-results',
    url: '/issues/reading-policy-results/',
    sourceIds: ['N1', 'D3', 'W2'],
  },
  {
    title: 'ごみ・脱炭素の負担と効果を、家庭・企業・市でどう分けるか',
    summary:
      'プラスチックの分別拡大を例に、出さない工夫、資源化、収集・処理の費用をつないで考える。',
    category: '環境・ごみ',
    slug: 'waste-and-carbon',
    url: '/issues/waste-and-carbon/',
    sourceIds: ['W1', 'W2', 'W3'],
  },
  {
    title: '働く人と地域の事業を、市はどう支えるか',
    summary:
      '人手不足と物価上昇に対し、資金・人材・仕事の進め方への支援を、働く人の変化まで確かめる。',
    category: '仕事・地域経済',
    slug: 'work-and-business',
    url: '/issues/work-and-business/',
    sourceIds: ['J1', 'J2', 'J3'],
  },
];
export const allPolicyIssues = [
  schoolLunch,
  ...mayoralIssues,
  ...foundationIssues,
  ...expansionIssues,
];
for (const record of records) {
  if (
    !allPolicyIssues.some((issue) => issue.url === record.page) &&
    !['/issues/population/', '/issues/households/', '/issues/density/'].includes(record.page)
  )
    throw new Error('Correction targets an unknown article');
}
export const policyIssues = allPolicyIssues.filter((issue) => !heldPage(issue.url));
