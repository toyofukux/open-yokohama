import { z } from 'zod';
import { geographies, snapshotSchema } from './schema.ts';

export const dynamicsPage =
  'https://www.city.yokohama.lg.jp/city-info/yokohamashi/tokei-chosa/portal/tokeisho/02.html';
export const dynamicsSources = [
  { scope: 'month', title: '人口動態・市の月別', file: 't020800-month.csv' },
  { scope: 'year', title: '人口動態・市の年別', file: 't020800-year.csv' },
  { scope: 'ku', title: '人口動態・行政区の年別', file: 't020800-ku.csv' },
] as const;
export const dynamicsMetrics = [
  {
    id: 'total_change',
    name: '人口増減',
    column: '人口増減',
    signed: true,
    definition:
      '自然増減と社会増減の合計。期間中の届出による動きで、ある時点の人口ではありません。',
  },
  {
    id: 'natural_change',
    name: '自然増減',
    column: '自然増減',
    signed: true,
    definition: '出生数から死亡数を引いた人数。',
  },
  {
    id: 'social_change',
    name: '社会増減',
    column: '社会増減',
    signed: true,
    definition:
      '市外・市内の転入から転出を引き、その他増減を加えた人数。市外との転出入差だけではありません。',
  },
  {
    id: 'births',
    name: '出生',
    column: '出生',
    signed: false,
    definition:
      '推計人口の人口動態表に掲載された期間中の出生数。厚生労働省の人口動態調査とは区別します。',
  },
  {
    id: 'deaths',
    name: '死亡',
    column: '死亡',
    signed: false,
    definition: '推計人口の人口動態表に掲載された期間中の死亡数。',
  },
  {
    id: 'external_in',
    name: '市外からの転入',
    column: '市外移動_転入',
    signed: false,
    definition: '横浜市外からの転入数。',
  },
  {
    id: 'external_out',
    name: '市外への転出',
    column: '市外移動_転出',
    signed: false,
    definition: '横浜市外への転出数。',
  },
  {
    id: 'internal_in',
    name: '市内移動の転入',
    column: '市内移動_転入',
    signed: false,
    definition: '原典の市内移動・転入数。市内移動の転出数と同数になるとは限りません。',
  },
  {
    id: 'internal_out',
    name: '市内移動の転出',
    column: '市内移動_転出',
    signed: false,
    definition: '原典の市内移動・転出数。市外への転出とは別に扱います。',
  },
  {
    id: 'other_change',
    name: 'その他増減',
    column: 'その他増減',
    signed: true,
    definition: '職権による記載・消除などの増減。社会増減に含め、転出入差と分けて表示します。',
  },
] as const;
export type DynamicsMetric = (typeof dynamicsMetrics)[number]['id'];
export type DynamicsScope = (typeof dynamicsSources)[number]['scope'];
export const dynamicsSnapshotSchema = snapshotSchema.extend({
  parserVersion: z.literal('dynamics-csv-v1'),
  scope: z.enum(['month', 'year', 'ku']),
});
export const dynamicsObservationSchema = z
  .object({
    id: z.string(),
    geography: z.enum(geographies.map((g) => g.code)),
    metric: z.enum(dynamicsMetrics.map((m) => m.id)),
    frequency: z.enum(['month', 'year']),
    period: z.string().regex(/^20\d{2}(-(0[1-9]|1[0-2]))?$/),
    value: z.number().int().safe(),
    sourceId: z.string().regex(/^[a-f0-9]{64}$/),
    row: z.number().int().min(2),
    column: z.literal('数・率'),
    revision: z.number().int().positive(),
    status: z.literal('machine_verified'),
  })
  .strict();
export const dynamicsSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.iso.datetime(),
    snapshots: z.array(dynamicsSnapshotSchema).length(3),
    observations: z.array(dynamicsObservationSchema).min(1),
  })
  .strict();
export type DynamicsDataset = z.infer<typeof dynamicsSchema>;
export type DynamicsObservation = z.infer<typeof dynamicsObservationSchema>;
export const dynamicsKey = (
  o: Pick<DynamicsObservation, 'frequency' | 'period' | 'geography' | 'metric'>,
) => `${o.frequency}:${o.period}:${o.geography}:${o.metric}`;

export function validateDynamics(input: unknown): DynamicsDataset {
  const data = dynamicsSchema.parse(input);
  const sources = new Map(data.snapshots.map((s) => [s.id, s]));
  if (sources.size !== 3 || new Set(data.snapshots.map((s) => s.scope)).size !== 3)
    throw new Error('Duplicate dynamics source');
  for (const source of data.snapshots) {
    const spec = dynamicsSources.find((s) => s.scope === source.scope);
    if (!spec) throw new Error('Unknown dynamics source');
    if (
      source.id !== source.sha256 ||
      source.path !== `data/raw/${source.id}.csv` ||
      source.sourcePage !== dynamicsPage ||
      source.url !== new URL(`02.files/${spec.file}`, dynamicsPage).href
    )
      throw new Error('Invalid dynamics source identity');
  }
  const index = new Map<string, DynamicsObservation>();
  const groups = new Map<string, DynamicsObservation[]>();
  for (const o of data.observations) {
    const source = sources.get(o.sourceId);
    if (!source) throw new Error('Missing dynamics source');
    if (
      (o.frequency === 'month') !== (o.period.length === 7) ||
      (o.frequency === 'month' && o.geography !== '141003')
    )
      throw new Error('Invalid dynamics period/geography');
    const scope = o.frequency === 'month' ? 'month' : o.geography === '141003' ? 'year' : 'ku';
    if (source.scope !== scope || o.id !== `${dynamicsKey(o)}:${o.sourceId}`)
      throw new Error('Dynamics provenance mismatch');
    const end =
      o.frequency === 'year'
        ? `${o.period}-12-31`
        : new Date(Date.UTC(Number(o.period.slice(0, 4)), Number(o.period.slice(5)), 0))
            .toISOString()
            .slice(0, 10);
    if (end >= data.generatedAt.slice(0, 10))
      throw new Error('Future or incomplete dynamics period');
    if (!dynamicsMetrics.find((m) => m.id === o.metric)?.signed && o.value < 0)
      throw new Error('Negative dynamics count');
    const key = dynamicsKey(o);
    if (index.has(key)) throw new Error('Duplicate dynamics observation');
    index.set(key, o);
    const groupKey = `${o.frequency}:${o.period}:${o.geography}`;
    const group = groups.get(groupKey) ?? [];
    group.push(o);
    groups.set(groupKey, group);
  }
  const get = (frequency: string, period: string, geography: string, metric: DynamicsMetric) => {
    const o = index.get(`${frequency}:${period}:${geography}:${metric}`);
    if (!o)
      throw new Error(`Incomplete dynamics period: ${frequency}:${period}:${geography}:${metric}`);
    return o.value;
  };
  for (const group of groups.values()) {
    if (group.length !== dynamicsMetrics.length) throw new Error('Incomplete dynamics metrics');
    const o = group[0];
    const v = (metric: DynamicsMetric) => get(o.frequency, o.period, o.geography, metric);
    if (
      v('births') - v('deaths') !== v('natural_change') ||
      v('natural_change') + v('social_change') !== v('total_change') ||
      v('external_in') -
        v('external_out') +
        v('internal_in') -
        v('internal_out') +
        v('other_change') !==
        v('social_change')
    )
      throw new Error('Dynamics arithmetic mismatch');
  }
  const years = [
    ...new Set(
      data.observations.filter((o) => o.frequency === 'year').map((o) => Number(o.period)),
    ),
  ].sort((a, b) => a - b);
  const months = [
    ...new Set(data.observations.filter((o) => o.frequency === 'month').map((o) => o.period)),
  ].sort();
  if (!years.length || !months.length || years[0] !== 2000 || months[0] !== '2000-01')
    throw new Error('Dynamics coverage must start in 2000');
  for (let year = 2000; year <= years[years.length - 1]; year++) {
    for (const metric of dynamicsMetrics) {
      const total = get('year', String(year), '141003', metric.id);
      const wardSum = geographies
        .filter((g) => g.code !== '141003')
        .reduce((sum, g) => sum + get('year', String(year), g.code, metric.id), 0);
      if (total !== wardSum) throw new Error('Dynamics ward sum mismatch');
      const monthSum = Array.from({ length: 12 }, (_, i) =>
        get('month', `${year}-${String(i + 1).padStart(2, '0')}`, '141003', metric.id),
      ).reduce((a, b) => a + b, 0);
      if (total !== monthSum) throw new Error('Dynamics month/year mismatch');
    }
  }
  for (let i = 0; i < months.length; i++) {
    const expected = `${2000 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
    if (months[i] !== expected) throw new Error('Missing dynamics month');
  }
  return data;
}

export function queryDynamics(
  data: DynamicsDataset,
  options: {
    geography?: string;
    metric?: DynamicsMetric;
    frequency: 'year' | 'month';
    period?: string;
  },
) {
  const observations = data.observations.filter(
    (o) =>
      o.frequency === options.frequency &&
      (!options.geography || o.geography === options.geography) &&
      (!options.metric || o.metric === options.metric) &&
      (!options.period || o.period === options.period),
  );
  return {
    observations,
    definitions: dynamicsMetrics.filter((m) => !options.metric || m.id === options.metric),
    unit: '人',
    periodBasis: '暦年（1月〜12月）または暦月の届出による増減',
    unavailable: observations.length === 0,
    sources: data.snapshots.filter((s) => observations.some((o) => o.sourceId === s.id)),
    generatedAt: data.generatedAt,
  };
}
