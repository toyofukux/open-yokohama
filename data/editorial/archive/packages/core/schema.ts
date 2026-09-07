import { z } from 'zod';

export const wards = [
  ['141011', 'tsurumi', '鶴見区'],
  ['141020', 'kanagawa', '神奈川区'],
  ['141038', 'nishi', '西区'],
  ['141046', 'naka', '中区'],
  ['141054', 'minami', '南区'],
  ['141119', 'konan', '港南区'],
  ['141062', 'hodogaya', '保土ケ谷区'],
  ['141127', 'asahi', '旭区'],
  ['141071', 'isogo', '磯子区'],
  ['141089', 'kanazawa', '金沢区'],
  ['141097', 'kohoku', '港北区'],
  ['141135', 'midori', '緑区'],
  ['141178', 'aoba', '青葉区'],
  ['141186', 'tsuzuki', '都筑区'],
  ['141101', 'totsuka', '戸塚区'],
  ['141151', 'sakae', '栄区'],
  ['141160', 'izumi', '泉区'],
  ['141143', 'seya', '瀬谷区'],
].map(([code, slug, name]) => ({ code, slug, name }));
export const geographies = [{ code: '141003', slug: 'yokohama', name: '横浜市' }, ...wards];
export const metrics = [
  {
    id: 'population',
    name: '人口',
    unit: '人',
    column: '人口総数［人］',
    definition:
      '国勢調査を基礎に出生・死亡・転出入等を加減した推計人口。住民基本台帳の登録者数とは異なる。',
    additive: true,
  },
  {
    id: 'households',
    name: '世帯数',
    unit: '世帯',
    column: '世帯数［世帯］',
    definition: '推計人口調査における世帯数。世帯の人数や家族構成は示さない。',
    additive: true,
  },
  {
    id: 'male',
    name: '男性人口',
    unit: '人',
    column: '男［人］',
    definition: '推計人口調査の男性人口。',
    additive: true,
  },
  {
    id: 'female',
    name: '女性人口',
    unit: '人',
    column: '女［人］',
    definition: '推計人口調査の女性人口。',
    additive: true,
  },
  {
    id: 'area',
    name: '面積',
    unit: 'km²',
    column: '面積［平方キロメートル］',
    definition: '原典に掲載された市区の面積。丸めと計測時点に注意。',
    additive: false,
  },
  {
    id: 'household_size',
    name: '1世帯あたり人数',
    unit: '人/世帯',
    column: '１世帯当たり人員［人］',
    definition:
      '人口を世帯数で割った原典の値。高齢単身世帯や子育て世帯の割合を直接示す指標ではない。',
    additive: false,
  },
  {
    id: 'density',
    name: '人口密度',
    unit: '人/km²',
    column: '人口密度［人／平方キロメートル］',
    definition: '人口を面積で割った原典の値。区内の人口の偏りは示さない。',
    additive: false,
  },
  {
    id: 'household_change',
    name: '届出による世帯増減',
    unit: '世帯',
    column: '届出による前月比増減の世帯数［世帯］',
    definition: '前月の届出による増減。統計基準の修正を含む残高の差とは一致しない場合がある。',
    additive: true,
  },
  {
    id: 'population_change',
    name: '届出による人口増減',
    unit: '人',
    column: '届出による前月比増減の人口［人］',
    definition:
      '前月の届出による増減。出生・死亡・転入・転出の内訳や政策効果はこの値だけでは判断できない。',
    additive: true,
  },
] as const;
export type MetricId = (typeof metrics)[number]['id'];
const date = z.iso.date();
export const snapshotSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{64}$/),
    url: z.url(),
    title: z.string().min(1),
    sourcePage: z.url(),
    retrievedAt: z.iso.datetime(),
    publishedAt: date.nullable(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    path: z.string().regex(/^data\/raw\/[a-f0-9]{64}\.csv$/),
    license: z.literal('CC-BY-4.0'),
    publisher: z.literal('横浜市'),
    parserVersion: z.literal('population-csv-v1'),
  })
  .strict();
export const observationSchema = z
  .object({
    id: z.string(),
    geography: z.string(),
    metric: z.enum(metrics.map((m) => m.id)),
    period: date,
    value: z.number().finite(),
    sourceId: z.string(),
    row: z.number().int().min(2),
    column: z.string(),
    revision: z.number().int().positive(),
    status: z.literal('machine_verified'),
  })
  .strict();
export const datasetSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.iso.datetime(),
    snapshots: z.array(snapshotSchema).min(1),
    observations: z.array(observationSchema).min(1),
  })
  .strict();
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type Dataset = z.infer<typeof datasetSchema>;

export function validateDataset(input: unknown): Dataset {
  const data = datasetSchema.parse(input);
  const sources = new Map(data.snapshots.map((s) => [s.id, s]));
  if (sources.size !== data.snapshots.length) throw new Error('Duplicate snapshot');
  const keys = new Set<string>();
  const groups = new Map<string, Observation[]>();
  for (const o of data.observations) {
    if (!sources.has(o.sourceId)) throw new Error(`Missing source: ${o.id}`);
    if (!geographies.some((g) => g.code === o.geography)) throw new Error('Unknown geography');
    const key = `${o.period}:${o.geography}:${o.metric}`;
    if (keys.has(key)) throw new Error(`Duplicate observation: ${key}`);
    keys.add(key);
    if (o.period > data.generatedAt.slice(0, 10)) throw new Error('Future observation');
    if (!['area', 'household_size'].includes(o.metric) && !Number.isInteger(o.value))
      throw new Error('Fractional count');
    if (!o.metric.endsWith('_change') && o.value <= 0)
      throw new Error('Invalid non-positive value');
    const group = groups.get(o.period) ?? [];
    group.push(o);
    groups.set(o.period, group);
  }
  for (const [period, group] of groups) {
    if (group.length !== geographies.length * metrics.length)
      throw new Error(`Incomplete period: ${period}`);
    const get = (code: string, metric: MetricId) => {
      const o = group.find((o) => o.geography === code && o.metric === metric);
      if (!o) throw new Error(`Missing metric: ${period}:${code}:${metric}`);
      return o.value;
    };
    for (const g of geographies) {
      if (get(g.code, 'male') + get(g.code, 'female') !== get(g.code, 'population'))
        throw new Error('Sex total mismatch');
      if (
        Math.abs(
          get(g.code, 'population') / get(g.code, 'households') - get(g.code, 'household_size'),
        ) > 0.011
      )
        throw new Error('Household ratio mismatch');
      if (Math.abs(get(g.code, 'population') / get(g.code, 'area') - get(g.code, 'density')) > 1)
        throw new Error('Density mismatch');
    }
    for (const m of metrics.filter((m) => m.additive)) {
      if (wards.reduce((sum, g) => sum + get(g.code, m.id), 0) !== get('141003', m.id))
        throw new Error(`Ward sum mismatch: ${period}:${m.id}`);
    }
  }
  return data;
}
