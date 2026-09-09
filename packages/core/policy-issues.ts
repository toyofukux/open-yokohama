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
export const allPolicyIssues = [schoolLunch, ...mayoralIssues, ...foundationIssues];
for (const record of records) {
  if (
    !allPolicyIssues.some((issue) => issue.url === record.page) &&
    !['/issues/population/', '/issues/households/', '/issues/density/'].includes(record.page)
  )
    throw new Error('Correction targets an unknown article');
}
export const policyIssues = allPolicyIssues.filter((issue) => !heldPage(issue.url));
