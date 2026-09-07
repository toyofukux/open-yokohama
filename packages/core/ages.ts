import { z } from 'zod';
import { geographies, snapshotSchema } from './schema.ts';

export const agesPage =
  'https://www.city.yokohama.lg.jp/city-info/yokohamashi/tokei-chosa/portal/tokeisho/02.html';
export const agesUrl = new URL('02.files/t020500.csv', agesPage).href;
export const ageMetrics = [
  {
    id: 'age_total',
    name: '年齢別人口の総数',
    definition: '各年1月1日現在の推計人口。年齢不詳を含みます。',
    unit: '人',
  },
  {
    id: 'age_under15',
    name: '0〜14歳の人口',
    definition: '各年1月1日現在の推計人口のうち、0〜14歳の合計。',
    unit: '人',
  },
  {
    id: 'age_15to64',
    name: '15〜64歳の人口',
    definition: '各年1月1日現在の推計人口のうち、15〜64歳の合計。就業者数ではありません。',
    unit: '人',
  },
  {
    id: 'age_65plus',
    name: '65歳以上の人口',
    definition: '各年1月1日現在の推計人口のうち、65歳以上の合計。100歳以上を含みます。',
    unit: '人',
  },
  {
    id: 'age_unknown',
    name: '年齢不詳の人口',
    definition: '原典の年齢不詳の人数。3区分へ比例配分せず、そのまま表示します。',
    unit: '人',
  },
] as const;
export type AgeMetric = (typeof ageMetrics)[number]['id'];
const count = z.number().int().nonnegative().safe();
const valuesSchema = z
  .object({
    age_total: count,
    age_under15: count,
    age_15to64: count,
    age_65plus: count,
    age_unknown: count,
  })
  .strict();
const rows = z.array(z.number().int().min(2));
export const agesSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.iso.datetime(),
    snapshots: z
      .array(snapshotSchema.extend({ parserVersion: z.literal('ages-csv-v1') }))
      .length(1),
    records: z
      .array(
        z
          .object({
            geography: z.enum(geographies.map((g) => g.code)),
            period: z.string().regex(/^20\d{2}-01-01$/),
            values: valuesSchema,
            sourceId: z.string().regex(/^[a-f0-9]{64}$/),
            sourceRows: z
              .object({
                age_total: rows.length(1),
                age_under15: rows.length(15),
                age_15to64: rows.length(50),
                age_65plus: rows.length(36),
                age_unknown: rows.length(1),
              })
              .strict(),
            column: z.literal('人口'),
            revision: z.number().int().positive(),
            status: z.literal('machine_verified'),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type AgesDataset = z.infer<typeof agesSchema>;
export type AgeRecord = AgesDataset['records'][number];
export function validateAges(input: unknown): AgesDataset {
  const data = agesSchema.parse(input);
  const source = data.snapshots[0];
  if (
    source.id !== source.sha256 ||
    source.path !== `data/raw/${source.id}.csv` ||
    source.url !== agesUrl ||
    source.sourcePage !== agesPage
  )
    throw new Error('Invalid age source identity');
  const index = new Map<string, AgeRecord>();
  for (const record of data.records) {
    const key = `${record.period}:${record.geography}`;
    if (index.has(key)) throw new Error('Duplicate age record');
    index.set(key, record);
    if (record.sourceId !== source.id || record.period > data.generatedAt.slice(0, 10))
      throw new Error('Invalid age source or future date');
    const v = record.values;
    if (
      v.age_total <= 0 ||
      v.age_under15 + v.age_15to64 + v.age_65plus + v.age_unknown !== v.age_total
    )
      throw new Error('Age total mismatch');
    const sourceRows = Object.values(record.sourceRows).flat();
    if (new Set(sourceRows).size !== sourceRows.length)
      throw new Error('Duplicate age source rows');
  }
  const years = [...new Set(data.records.map((r) => Number(r.period.slice(0, 4))))].sort(
    (a, b) => a - b,
  );
  if (years[0] !== 2000) throw new Error('Age coverage must start in 2000');
  for (let year = 2000; year <= years[years.length - 1]; year++) {
    const period = `${year}-01-01`;
    for (const geography of geographies)
      if (!index.has(`${period}:${geography.code}`))
        throw new Error('Incomplete age year or geography');
    const city = index.get(`${period}:141003`);
    if (!city) throw new Error('Missing age city');
    for (const metric of ageMetrics) {
      const sum = geographies
        .filter((g) => g.code !== '141003')
        .reduce((sum, g) => sum + (index.get(`${period}:${g.code}`)?.values[metric.id] ?? NaN), 0);
      if (sum !== city.values[metric.id]) throw new Error('Age ward sum mismatch');
    }
  }
  return data;
}
export function queryAges(
  data: AgesDataset,
  options: { geography?: string; metric?: AgeMetric; period?: string },
) {
  const selected = data.records.filter(
    (r) =>
      (!options.geography || r.geography === options.geography) &&
      (!options.period || r.period === options.period),
  );
  const definitions = ageMetrics.filter((m) => !options.metric || m.id === options.metric);
  return {
    observations: selected.flatMap((r) =>
      definitions.map((m) => ({
        geography: r.geography,
        metric: m.id,
        period: r.period,
        value: r.values[m.id],
        unit: m.unit,
        sourceId: r.sourceId,
        rows: r.sourceRows[m.id],
        column: r.column,
        revision: r.revision,
        status: r.status,
      })),
    ),
    definitions,
    sources: data.snapshots,
    unavailable: selected.length === 0,
    generatedAt: data.generatedAt,
    periodBasis: '各年1月1日現在の推計人口',
    shareDenominator: '年齢不詳を含む総人口。年齢不詳を除いた構成比とは異なります。',
  };
}
