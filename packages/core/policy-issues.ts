/** Editorial pages have no population metric; keep them out of statistical routes. */
export const schoolLunch = {
  slug: 'school-lunch',
  url: '/issues/school-lunch/',
  category: '子育て・教育',
  title: '横浜は、中学校の給食費も無償にすべきか',
  summary: '家計の負担、いまある援助、支え続ける財源。三つの選択肢から、何を優先するか考える。',
};

export const mayoralIssues = [
  {
    title: '待機児童ゼロの横浜で、保育の何を改善するか',
    summary:
      '公式のゼロと、希望する保育を使えることを分ける。年齢、場所、保育の質から次の支援を考える。',
    category: '子育て・保育',
    slug: 'childcare-access',
    sourceIds: ['N1', 'N3'],
    url: '/issues/childcare-access/',
  },
  {
    title: '横浜の予算を、何に優先して使うか',
    summary:
      '2兆円の予算と、新しく使えるお金は違う。サービス、将来の負担、政策の追加費用をそろえて考える。',
    category: '財政・優先順位',
    slug: 'city-budget',
    sourceIds: ['F1', 'F2'],
    url: '/issues/city-budget/',
  },
  {
    title: '市政への信頼を、どう立て直すか',
    summary: 'トップの説明責任と、問題を止められる組織。政策の中身に加え、実行する仕組みを考える。',
    category: '市政・説明責任',
    slug: 'city-governance',
    sourceIds: ['G1', 'G2'],
    url: '/issues/city-governance/',
  },
  {
    title: 'GREEN×EXPOに、これからどこまで市費をかけるか',
    summary:
      '総額への賛否から、これから変えられる支出へ。会場建設の予算と、まちに残す価値を分けて考える。',
    category: '大型事業・まちづくり',
    slug: 'green-expo',
    sourceIds: ['X1', 'F2'],
    url: '/issues/green-expo/',
  },
  {
    title: '移動の支援は、運賃と路線のどちらを厚くするか',
    summary: '敬老パスを使えることと、乗れる交通が近くにあること。通院や買い物に届く支援を考える。',
    category: '交通・高齢期の暮らし',
    slug: 'local-mobility',
    sourceIds: ['M1', 'M2'],
    url: '/issues/local-mobility/',
  },
  {
    title: '学校体育館の空調を、いつ、どこまで整えるか',
    summary: '子どもの暑さ対策と避難所の環境。設置の速さ、費用、災害時に使える備えを一緒に考える。',
    category: '防災・学校施設',
    slug: 'school-shelters',
    sourceIds: ['D1', 'F2'],
    url: '/issues/school-shelters/',
  },
];
export const policyIssues = [schoolLunch, ...mayoralIssues];
