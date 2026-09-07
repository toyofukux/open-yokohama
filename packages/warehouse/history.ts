import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { geographies, metrics } from '../core/schema.ts';
import { decodeCsv } from '../ingestion/population.ts';

export const historySeries = ['historical', 'city-series', 'ward-monthly'] as const;
export type HistorySeries = (typeof historySeries)[number];
export const historySourceSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{64}$/),
    url: z.url(),
    sourcePage: z.url(),
    title: z.string(),
    retrievedAt: z.iso.datetime(),
    publishedAt: z.iso.date().nullable(),
    sha256: z.string(),
    path: z.string(),
    license: z.literal('CC-BY-4.0'),
    publisher: z.literal('横浜市'),
    parserVersion: z.literal('history-csv-v1'),
    series: z.enum(historySeries),
  })
  .strict();
export type HistorySource = z.infer<typeof historySourceSchema>;
export const historyRecordSchema = z
  .object({
    dataset: z.enum(historySeries),
    geography: z.string(),
    metric: z.enum(metrics.map((m) => m.id)),
    period: z.iso.date(),
    frequency: z.enum(['year', 'month']),
    value: z.number().finite(),
    sourceId: z.string(),
    row: z.number().int().min(2),
    column: z.string(),
    basis: z.string(),
    geographyBasis: z.string(),
    provisional: z.boolean(),
  })
  .strict();
export type HistoryRecord = z.infer<typeof historyRecordSchema>;
export const historySchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.iso.datetime(),
    snapshots: z.array(historySourceSchema).length(3),
    records: z.array(historyRecordSchema).min(1),
  })
  .strict();
export type HistoryDataset = z.infer<typeof historySchema>;
const headers = {
  historical: ['年（和暦）', '年（西暦）', '行政区', '出典', '世帯・人口の別', '世帯数・人口'],
  'city-series': ['年（和暦）', '年（西暦）', '月', '項目', '単位', '値'],
  'ward-monthly': [
    '年（和暦）',
    '年（西暦）',
    '月',
    '年月日',
    '全国地方公共団体コード',
    '市区名',
    '項目',
    '単位',
    '値',
  ],
};
const fields: Record<string, { metric: HistoryRecord['metric']; unit: string }> = {
  人口: { metric: 'population', unit: '人' },
  人口総数: { metric: 'population', unit: '人' },
  世帯数: { metric: 'households', unit: '世帯' },
  男: { metric: 'male', unit: '人' },
  女: { metric: 'female', unit: '人' },
  市域面積: { metric: 'area', unit: 'km2' },
  面積: { metric: 'area', unit: '平方キロメートル' },
  '１世帯当たり人員': { metric: 'household_size', unit: '人' },
  人口密度: { metric: 'density', unit: '人/平方キロメートル' },
  届出による前月比増減の世帯数: { metric: 'household_change', unit: '世帯' },
  届出による前月比増減の人口: { metric: 'population_change', unit: '人' },
};
export function parseHistory(bytes: Uint8Array, source: HistorySource): HistoryRecord[] {
  const text = decodeCsv(bytes);
  const rows: string[][] = parse(text, { bom: true });
  if (rows.some((r) => r.some((c) => /[\r\n]/.test(c))))
    throw new Error('Multiline history cell would invalidate row references');
  if (JSON.stringify(rows[0]) !== JSON.stringify(headers[source.series]))
    throw new Error('Unexpected history CSV schema');
  return rows.slice(1).map((cells, index) => {
    if (cells.length !== rows[0].length) throw new Error('History row width mismatch');
    const cell = (key: string) => cells[rows[0].indexOf(key)]?.trim();
    const historical = source.series === 'historical';
    const year = cell('年（西暦）');
    if (!/^(19|20)\d{2}$/.test(year)) throw new Error('Invalid history year');
    const month = historical ? 10 : Number(cell('月'));
    if (!Number.isInteger(month) || month < 1 || month > 12)
      throw new Error('Invalid history month');
    const period = `${year}-${String(month).padStart(2, '0')}-01`;
    if (source.series === 'ward-monthly' && cell('年月日').replaceAll('/', '-') !== period)
      throw new Error('History date mismatch');
    const name =
      source.series === 'city-series'
        ? '横浜市'
        : cell(historical ? '行政区' : '市区名').replace('全市', '横浜市');
    const geo = geographies.find((g) => g.name === name);
    if (!geo || (source.series === 'ward-monthly' && cell('全国地方公共団体コード') !== geo.code))
      throw new Error('Unknown history geography');
    const field = fields[cell(historical ? '世帯・人口の別' : '項目')];
    if (!field) throw new Error('Unknown history metric');
    if (!historical && cell('単位') !== field.unit)
      throw new Error(`History unit mismatch: ${cell('項目')}: ${cell('単位')}`);
    const raw = cell(historical ? '世帯数・人口' : '値');
    if (!/^-?\d+(\.\d+)?$/.test(raw)) throw new Error('Missing history numeric value');
    const census = historical ? cell('出典') : '';
    if (historical && census !== '推計人口' && !/^第[１-９1-9][０-９0-9]*回国勢調査$/.test(census))
      throw new Error('Unknown historical survey');
    return historyRecordSchema.parse({
      dataset: source.series,
      geography: geo.code,
      metric: field.metric,
      period,
      frequency:
        historical || (source.series === 'city-series' && Number(year) < 2000) ? 'year' : 'month',
      value: Number(raw),
      sourceId: source.id,
      row: index + 2,
      column: historical ? '世帯数・人口' : '値',
      basis: historical
        ? census
        : period >= '2025-10-01'
          ? '2025年国勢調査速報値に基づく暫定推計'
          : '各時点の国勢調査を基礎とする人口・世帯数',
      geographyBasis:
        Number(year) < 1995 ? `当時の市区境界（${year}年）` : '原典掲載時点の市区境界（18区体制）',
      provisional: !historical && period >= '2025-10-01',
    });
  });
}

export function validateHistory(input: unknown): HistoryDataset {
  const data = historySchema.parse(input);
  if (new Set(data.snapshots.map((s) => s.series)).size !== 3)
    throw new Error('Missing history series');
  const sources = new Map(data.snapshots.map((s) => [s.id, s]));
  const index = new Map<string, HistoryRecord>();
  const groups = new Map<string, HistoryRecord[]>();
  for (const r of data.records) {
    const key = `${r.dataset}:${r.period}:${r.geography}:${r.metric}`;
    if (index.has(key)) throw new Error('Duplicate history observation');
    index.set(key, r);
    if (sources.get(r.sourceId)?.series !== r.dataset || r.period > data.generatedAt.slice(0, 10))
      throw new Error('History source/date mismatch');
    if (!['area', 'household_size'].includes(r.metric) && !Number.isSafeInteger(r.value))
      throw new Error('Fractional history count');
    if (!r.metric.endsWith('_change') && r.value <= 0) throw new Error('Invalid history value');
    const k = `${r.dataset}:${r.period}:${r.geography}`;
    const group = groups.get(k) ?? [];
    group.push(r);
    groups.set(k, group);
  }
  for (const group of groups.values()) {
    const r = group[0];
    const expected = r.dataset === 'historical' ? 2 : r.dataset === 'city-series' ? 5 : 9;
    if (group.length !== expected) throw new Error('Incomplete history metrics');
    const get = (metric: string) => group.find((o) => o.metric === metric)?.value ?? NaN;
    if (r.dataset !== 'historical' && get('male') + get('female') !== get('population'))
      throw new Error('History sex total mismatch');
    if (
      r.dataset === 'ward-monthly' &&
      (Math.abs(get('population') / get('households') - get('household_size')) > 0.011 ||
        Math.abs(get('population') / get('area') - get('density')) > 1)
    )
      throw new Error('History ratio mismatch');
  }
  for (const dataset of historySeries) {
    const records = data.records.filter((r) => r.dataset === dataset);
    const periods = [...new Set(records.map((r) => r.period))].sort();
    if (
      periods[0] !==
      { historical: '1920-10-01', 'city-series': '1979-10-01', 'ward-monthly': '2014-06-01' }[
        dataset
      ]
    )
      throw new Error('Missing history start');
    const monthly = periods.filter(
      (p) => dataset === 'ward-monthly' || (dataset === 'city-series' && p >= '2000-01-01'),
    );
    for (let i = 1; i < monthly.length; i++) {
      const prev = new Date(`${monthly[i - 1]}T00:00:00Z`);
      prev.setUTCMonth(prev.getUTCMonth() + 1);
      if (prev.toISOString().slice(0, 10) !== monthly[i]) throw new Error('Missing history month');
    }
    if (dataset === 'city-series')
      for (let year = 1979; year < 2000; year++)
        if (!periods.includes(`${year}-10-01`)) throw new Error('Missing early city year');
    if (dataset === 'historical') {
      for (const year of [
        1920, 1925, 1930, 1935, 1940, 1947, 1950, 1955, 1960, 1965, 1970, 1975, 1980, 1985, 1990,
      ])
        if (!periods.includes(`${year}-10-01`)) throw new Error('Missing census year');
    }
    if (dataset === 'historical')
      for (let year = 1992; year <= Number(periods.at(-1)?.slice(0, 4)); year++)
        if (!periods.includes(`${year}-10-01`)) throw new Error('Missing history year');
    for (const period of periods) {
      const rs = records.filter((r) => r.period === period);
      const codes = [...new Set(rs.map((r) => r.geography))];
      if (
        !codes.includes('141003') ||
        (dataset === 'city-series'
          ? codes.length !== 1
          : (dataset === 'ward-monthly' || period >= '1995-01-01') && codes.length !== 19)
      )
        throw new Error('Incomplete history geographies');
      if (dataset !== 'city-series' && codes.length > 1)
        for (const metric of metrics.filter((m) => m.additive)) {
          const city = index.get(`${dataset}:${period}:141003:${metric.id}`);
          if (!city) continue;
          const sum = rs
            .filter((r) => r.metric === metric.id && r.geography !== '141003')
            .reduce((n, r) => n + r.value, 0);
          if (sum !== city.value) throw new Error('History ward sum mismatch');
        }
    }
  }
  return data;
}
